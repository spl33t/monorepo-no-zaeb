#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const layout = require('../lib/monorepo-layout');
const { createPackage } = require('../generators/package/create-package');
const { interactiveLink } = require('./link-package');

/**
 * `@inquirer/prompts` — ESM-only с v8, грузится через динамический `import()`
 * — стандартный мост ESM→CJS в Node.
 * @returns {Promise<{ input: Function, confirm: Function }>}
 */
function loadPrompts() {
  return import('@inquirer/prompts');
}

function parseArgv(argv) {
  const out = { help: false, noInstall: false, name: undefined };
  const positional = [];
  for (const a of argv) {
    if (a === '--') continue;
    if (a === '-h' || a === '--help') {
      out.help = true;
      continue;
    }
    if (a === '--no-install') {
      out.noInstall = true;
      continue;
    }
    if (a.startsWith('-')) throw new Error(`Неизвестный флаг: ${a}`);
    positional.push(a);
  }
  out.name = positional[0];
  return out;
}

function validateName(name) {
  return Boolean(name && /^[a-z0-9-]+$/.test(name));
}

async function maybeInstall(root, shouldInstall) {
  if (!shouldInstall) {
    console.log('\n⏭️  Пропущена установка. Вручную: pnpm install');
    return;
  }
  console.log('\n📦 pnpm install...');
  try {
    execSync('pnpm install', { stdio: 'inherit', cwd: root });
    console.log('\n✅ Готово');
  } catch {
    console.warn('\n⚠️  Установите вручную: pnpm install');
  }
}

function scaffold(root, name) {
  const rel = `packages/${name}`;
  const pkgDir = path.join(root, 'packages', name);

  layout.ensureLayoutDirs(root);

  if (fs.existsSync(pkgDir)) {
    console.error(`❌ Пакет "${name}" уже существует`);
    process.exit(1);
  }

  console.log(`\n📦 Создаю пакет "${name}" → ${rel}...\n`);
  const result = createPackage(pkgDir, name);

  console.log('✅ Структура:');
  console.log(`   ${rel}/`);
  result.structure.forEach((line) => console.log(`   ${line}`));
  result.commands.forEach((cmd) => console.log(`\n📎 ${cmd}`));
}

async function interactive(root) {
  const { input, confirm } = await loadPrompts();

  console.log('\n🚀 Новый пакет (packages/)\n');
  const name = await input({
    message: 'Название',
    default: 'shared',
    validate: (value) => validateName(value.trim()) || 'Только a-z, 0-9, -',
  });

  const trimmedName = name.trim();
  scaffold(root, trimmedName);

  // Переиспользует тот же шаг выбора потребителей, что и link-package.js.
  // packages зафиксирован на только что созданном пакете — вопрос "какие
  // пакеты подключить" бессмысленен, когда пакет один и это тот самый,
  // который только что создали; interactiveLink его же исключает из
  // списка потребителей (не может зависеть сам от себя). Без отдельного
  // confirm-гейта: чекбокс потребителей можно пропустить пустым выбором.
  await interactiveLink(root, { packages: [{ name: trimmedName, relPosix: `packages/${trimmedName}` }] });

  const shouldInstall = await confirm({ message: 'Установить зависимости?', default: true });
  await maybeInstall(root, shouldInstall);
}

async function run() {
  const root = layout.findMonorepoRoot();
  let cli;
  try {
    cli = parseArgv(process.argv.slice(2));
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  if (cli.help) {
    console.log(
      'Использование: pnpm run create:package -- <name> [--no-install]\n\n' +
        'Создаёт packages/<name> — pnpm-пакет (workspace:*) без build-шага: main/exports\n' +
        'указывают прямо на src/index.ts, компилирует потребитель (Vite нативно; Nest —\n' +
        'через webpack-билдер app\'а, см. apps/<name>/webpack.config.js).\n' +
        'Без аргументов — интерактивный ввод названия.\n\n' +
        'Примеры:\n' +
        '  pnpm run create:package -- shared\n' +
        '  pnpm run create:package -- shared --no-install\n',
    );
    process.exit(0);
  }

  if (cli.name) {
    if (!validateName(cli.name)) {
      console.error('❌ Название: только a-z, 0-9, -');
      process.exit(1);
    }
    scaffold(root, cli.name);
    await maybeInstall(root, !cli.noInstall);
    return;
  }

  await interactive(root);
}

module.exports = { scaffold };

if (require.main === module) {
  run().catch((err) => {
    if (err?.name === 'ExitPromptError') {
      console.log('\nОтменено');
      process.exit(0);
    }
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  });
}
