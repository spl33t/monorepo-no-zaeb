#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const layout = require('../lib/monorepo-layout');
const { findPackageImportUsages } = require('../lib/scan-package-imports');

/**
 * `@inquirer/prompts` — ESM-only с v8, грузится через динамический `import()`
 * — стандартный мост ESM→CJS в Node.
 * @returns {Promise<{ checkbox: Function, confirm: Function }>}
 */
function loadPrompts() {
  return import('@inquirer/prompts');
}

function parseArgv(argv) {
  const out = { help: false, noInstall: false, yes: false, name: undefined };
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
    if (a === '--yes') {
      out.yes = true;
      continue;
    }
    if (a.startsWith('-')) throw new Error(`Неизвестный флаг: ${a}`);
    positional.push(a);
  }
  out.name = positional[0];
  return out;
}

function removePackage(pkg) {
  fs.rmSync(pkg.absDir, { recursive: true, force: true });
  console.log(`✅ Удалено: ${pkg.relPosix}`);
}

/**
 * Убирает "@packages/<name>": "workspace:*" из dependencies/devDependencies
 * всех apps/* и остальных packages/* — иначе следующий `pnpm install`
 * падает на нерезолвящемся workspace:*-протоколе (пакета физически уже нет).
 * Импорты в исходном коде (`import { x } from '@packages/<name>'`) этим не
 * трогаются — это уже вопрос кода, не package.json, чинится руками.
 * @param {string} root
 * @param {string} pkgName
 * @returns {string[]} relPosix тех, у кого реально была ссылка
 */
function removePackageReferences(root, pkgName) {
  const fullName = `@packages/${pkgName}`;
  const members = [...layout.listApps(root), ...layout.listPackages(root)];
  const updated = [];

  for (const member of members) {
    const pkgJsonPath = path.join(member.absDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    let changed = false;
    for (const field of ['dependencies', 'devDependencies']) {
      if (pkgJson[field]?.[fullName]) {
        delete pkgJson[field][fullName];
        changed = true;
        // Пустой {} после удаления — убираем всё поле, а не оставляем мусор.
        if (Object.keys(pkgJson[field]).length === 0) delete pkgJson[field];
      }
    }
    if (!changed) continue;

    fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
    updated.push(member.relPosix);
  }

  return updated;
}

/**
 * Удаляет пакеты, убирает ссылки на них у всех потребителей и ищет, где в
 * apps/*, packages/* остались реальные импорты удалённых пакетов (сборка/
 * тайпчек на них упадёт) — один консолидированный отчёт в конце, а не по
 * одному на каждый пакет (при batch-удалении он повторялся бы столько раз,
 * сколько пакетов — читалось грязно). Не переписывает эти импорты (в
 * отличие от rename:package) — для удалённого пакета нет корректной цели
 * замены, только конкретный список файл:строка вместо общей фразы
 * "почисти вручную", чтобы не искать их руками по всему репо.
 * @param {string} root
 * @param {Array<{ name: string, absDir: string, relPosix: string }>} packages
 */
function removePackagesAndReferences(root, packages) {
  const referencesByConsumer = new Map();
  const importUsagesByPackage = new Map();

  for (const pkg of packages) {
    removePackage(pkg);
    for (const rel of removePackageReferences(root, pkg.name)) {
      if (!referencesByConsumer.has(rel)) referencesByConsumer.set(rel, []);
      referencesByConsumer.get(rel).push(pkg.name);
    }
    const usages = findPackageImportUsages(root, pkg.name);
    if (usages.length > 0) importUsagesByPackage.set(pkg.name, usages);
  }

  if (referencesByConsumer.size > 0) {
    console.log('\n🧹 Убрал ссылки из package.json:');
    for (const [rel, pkgNames] of referencesByConsumer) {
      console.log(`   ${rel}: ${pkgNames.map((n) => `@packages/${n}`).join(', ')}`);
    }
  }

  if (importUsagesByPackage.size > 0) {
    console.log(
      '\n⚠️  Остались импорты удалённых пакетов в коде (apps/*, packages/*) — сборка/тайпчек упадёт,' +
        ' пока не поправишь вручную:',
    );
    for (const [pkgName, usages] of importUsagesByPackage) {
      console.log(`   @packages/${pkgName}:`);
      for (const usage of usages) {
        console.log(`     ${usage.relPosix}`);
        for (const hunk of usage.hunks) {
          console.log(`       :${hunk.line}  ${hunk.match}`);
        }
      }
    }
  }
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

async function namedFlow(root, cli) {
  const pkg = layout.listPackages(root).find((p) => p.name === cli.name);
  if (!pkg) {
    console.error(`❌ Пакет "${cli.name}" не найден`);
    process.exit(1);
  }

  if (!cli.yes) {
    const { confirm } = await loadPrompts();
    const proceed = await confirm({ message: `Удалить ${pkg.relPosix}?`, default: false });
    if (!proceed) {
      console.log('Отменено');
      return;
    }
  }

  removePackagesAndReferences(root, [pkg]);
  await maybeInstall(root, !cli.noInstall);
}

async function interactiveFlow(root) {
  const packages = layout.listPackages(root);
  if (packages.length === 0) {
    console.log('Нет ни одного пакета для удаления.');
    return;
  }

  const { checkbox, confirm } = await loadPrompts();

  console.log('\n🗑️  Удаление пакетов\n');
  const selectedPackages = await checkbox({
    message: 'Выберите пакеты',
    choices: packages.map((p) => ({ name: p.relPosix, value: p })),
    theme: {
      style: {
        renderSelectedChoices: (chosen) => chosen.map((c) => c.value.relPosix).join(', '),
      },
    },
  });

  if (selectedPackages.length === 0) {
    console.log('Ничего не выбрано');
    return;
  }

  const list = selectedPackages.map((p) => p.relPosix).join(', ');
  const proceed = await confirm({ message: `Удалить ${list}?`, default: false });
  if (!proceed) {
    console.log('Отменено');
    return;
  }

  removePackagesAndReferences(root, selectedPackages);
  const shouldInstall = await confirm({ message: 'Установить зависимости заново?', default: true });
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
      'Использование: pnpm run remove:package -- <name> [--no-install] [--yes]\n\n' +
        'Удаляет packages/<name> и убирает "@packages/<name>": "workspace:*" из\n' +
        'package.json всех apps/*, которые на него ссылались. Показывает список\n' +
        'оставшихся импортов "@packages/<name>" в apps/*, packages/* (файл:строка) —\n' +
        'не переписывает их (для удалённого пакета нет цели замены), это уже руками.\n' +
        'Без аргументов — интерактивный выбор из списка.\n\n' +
        'Примеры:\n' +
        '  pnpm run remove:package -- shared\n' +
        '  pnpm run remove:package -- shared --yes\n',
    );
    process.exit(0);
  }

  if (cli.name) {
    await namedFlow(root, cli);
    return;
  }

  await interactiveFlow(root);
}

module.exports = { removePackage };

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
