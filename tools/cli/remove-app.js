#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const layout = require('../lib/monorepo-layout');
const { parseDockerCompose, stringifyDockerCompose } = require('../lib/docker-compose-parser');

/**
 * `@inquirer/prompts` — ESM-only с v8, грузится через динамический `import()`
 * — стандартный мост ESM→CJS в Node.
 * @returns {Promise<{ checkbox: Function, confirm: Function }>}
 */
function loadPrompts() {
  return import('@inquirer/prompts');
}

function parseArgv(argv) {
  const out = { help: false, noInstall: false, yes: false, kind: undefined, name: undefined };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      out.help = true;
      continue;
    }
    if (a === '--no-install') {
      out.noInstall = true;
      continue;
    }
    if (a === '--yes') {
      out.yes = true;
      continue;
    }
    if (a === '--kind') {
      out.kind = argv[++i];
      continue;
    }
    if (a.startsWith('-')) throw new Error(`Неизвестный флаг: ${a}`);
    positional.push(a);
  }
  out.name = positional[0];
  return out;
}

/**
 * @param {string} root
 * @param {string} service
 */
function removeFromDockerCompose(root, service) {
  const composePath = path.join(root, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) return false;
  let compose;
  try {
    compose = parseDockerCompose(composePath);
  } catch {
    return false;
  }
  if (!compose.services || !compose.services[service]) return false;
  delete compose.services[service];
  fs.writeFileSync(composePath, stringifyDockerCompose(compose));
  return true;
}

/**
 * @param {{ kind: string, name: string, absDir: string, relPosix: string }} app
 * @param {string} root
 */
function removeApp(app, root) {
  // Сначала папка: если rmSync упадёт (например, EPERM — файл ещё занят на Windows),
  // docker-compose.yml должен остаться нетронутым, чтобы состояние не разъехалось.
  fs.rmSync(app.absDir, { recursive: true, force: true });
  console.log(`✅ Удалено: ${app.relPosix}`);

  const service = layout.composeServiceName(app.kind, app.name);
  const removedFromCompose = removeFromDockerCompose(root, service);
  if (removedFromCompose) {
    console.log(`✅ Сервис "${service}" убран из docker-compose.yml`);
  }
}

async function maybeInstall(monorepoRoot, shouldInstall) {
  if (!shouldInstall) {
    console.log('\n⏭️  Пропущена установка. Вручную: pnpm install');
    return;
  }
  console.log('\n📦 pnpm install...');
  try {
    execSync('pnpm install', { stdio: 'inherit', cwd: monorepoRoot });
    console.log('\n✅ Готово');
  } catch {
    console.warn('\n⚠️  Установите вручную: pnpm install');
  }
}

async function namedFlow(root, cli) {
  let app;
  try {
    app = layout.findAppByName(cli.name, root, cli.kind);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
  if (!app) {
    console.error(`❌ Приложение "${cli.name}" не найдено`);
    process.exit(1);
  }

  if (!cli.yes) {
    const { confirm } = await loadPrompts();
    const proceed = await confirm({ message: `Удалить ${app.relPosix}?`, default: false });
    if (!proceed) {
      console.log('Отменено');
      return;
    }
  }

  removeApp(app, root);
  await maybeInstall(root, !cli.noInstall);
}

async function interactiveFlow(root) {
  const apps = layout.listApps(root);
  if (apps.length === 0) {
    console.log('Нет ни одного приложения для удаления.');
    return;
  }

  const { checkbox, confirm } = await loadPrompts();

  console.log('\n🗑️  Удаление приложений\n');
  const selectedApps = await checkbox({
    message: 'Выберите приложения',
    choices: apps.map((a) => ({ name: `${a.relPosix} (${a.kind})`, value: a })),
    theme: {
      style: {
        renderSelectedChoices: (chosen) => chosen.map((c) => c.value.relPosix).join(', '),
      },
    },
  });

  if (selectedApps.length === 0) {
    console.log('Ничего не выбрано');
    return;
  }

  const list = selectedApps.map((a) => a.relPosix).join(', ');
  const proceed = await confirm({ message: `Удалить ${list}?`, default: false });
  if (!proceed) {
    console.log('Отменено');
    return;
  }

  selectedApps.forEach((app) => removeApp(app, root));
  const shouldInstall = await confirm({ message: 'Установить зависимости заново?', default: true });
  await maybeInstall(root, shouldInstall);
}

async function run() {
  const root = layout.findMonorepoRoot();
  let cli;
  try {
    cli = parseArgv(process.argv.slice(2).filter((a) => a !== '--'));
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  if (cli.help) {
    console.log(
      'Использование: pnpm run remove:app -- <name> [--kind nest|vite] [--no-install] [--yes]\n\n' +
        'Удаляет приложение: папку, сервис в docker-compose.yml, опционально — pnpm install для чистки lockfile.\n' +
        'Без аргументов — интерактивный выбор из списка существующих приложений.\n\n' +
        'Примеры:\n' +
        '  pnpm run remove:app -- api\n' +
        '  pnpm run remove:app -- api --kind nest --yes\n',
    );
    process.exit(0);
  }

  if (cli.name) {
    await namedFlow(root, cli);
    return;
  }

  await interactiveFlow(root);
}

module.exports = { removeApp };

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
