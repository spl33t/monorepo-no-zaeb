#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const layout = require('../lib/monorepo-layout');

/**
 * `@inquirer/prompts` — ESM-only с v8, грузится через динамический `import()`
 * — стандартный мост ESM→CJS в Node.
 * @returns {Promise<{ checkbox: Function, confirm: Function }>}
 */
function loadPrompts() {
  return import('@inquirer/prompts');
}

function parseArgv(argv) {
  const out = { help: false, noInstall: false, kind: undefined, appName: undefined, packageNames: [] };
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
    if (a === '--kind') {
      out.kind = argv[++i];
      continue;
    }
    if (a.startsWith('-')) throw new Error(`Неизвестный флаг: ${a}`);
    positional.push(a);
  }
  out.appName = positional[0];
  out.packageNames = positional.slice(1);
  return out;
}

/**
 * @param {object} pkgJson
 * @param {string} fullName "@packages/<name>"
 */
function alreadyLinked(pkgJson, fullName) {
  return Boolean(pkgJson.dependencies?.[fullName] || pkgJson.devDependencies?.[fullName]);
}

/**
 * Дописывает "@packages/<name>": "workspace:*" в dependencies app'а — тот
 * же ручной шаг, который create-package.js сейчас только подсказывает
 * текстом ("Подключить: ... + pnpm install").
 * @param {{ absDir: string, relPosix: string }} app
 * @param {{ name: string, relPosix: string }} pkg
 * @returns {boolean} true, если реально дописано (false — уже было)
 */
function linkPackage(app, pkg) {
  const pkgJsonPath = path.join(app.absDir, 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const fullName = `@packages/${pkg.name}`;

  if (alreadyLinked(pkgJson, fullName)) {
    console.log(`ℹ️  ${app.relPosix} уже зависит от ${fullName}`);
    return false;
  }

  pkgJson.dependencies = pkgJson.dependencies || {};
  pkgJson.dependencies[fullName] = 'workspace:*';
  fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
  console.log(`✅ ${app.relPosix}: добавлено "${fullName}": "workspace:*"`);
  return true;
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
  const app = layout.findAppByName(cli.appName, root, cli.kind);
  if (!app) {
    console.error(`❌ Приложение "${cli.appName}" не найдено`);
    process.exit(1);
  }

  const available = layout.listPackages(root);
  const packages = cli.packageNames.map((name) => {
    const pkg = available.find((p) => p.name === name);
    if (!pkg) {
      console.error(`❌ Пакет "${name}" не найден`);
      process.exit(1);
    }
    return pkg;
  });

  const linkedAny = packages.map((pkg) => linkPackage(app, pkg)).some(Boolean);
  if (linkedAny) await maybeInstall(root, !cli.noInstall);
}

/**
 * Выбор потребителей (apps + packages) и пакетов для подключения — без
 * запроса install, это отдельная забота вызывающего. Вынесено отдельно от
 * interactiveFlow, чтобы create-package.js мог переиспользовать именно этот
 * шаг напрямую (там свой единый вопрос об установке для всего флоу — не
 * плодить второй такой же вопрос).
 *
 * `fixedPackages` — если задан (create-package.js передаёт только что
 * созданный пакет), шаг "какие пакеты подключить" вообще не задаётся: раз
 * пакет один и это тот самый, который только что создали, вопрос
 * бессмысленный — сразу подключаем именно его. Он же исключается из списка
 * потребителей (не может зависеть сам от себя). Без `fixedPackages`
 * (самостоятельный link:package) — обе части списка обычные, вопрос
 * "какие пакеты" задаётся по-настоящему, раз кандидатов реально несколько.
 * @param {string} root
 * @param {{ packages?: Array<{ name: string, relPosix: string }> }} [options]
 * @returns {Promise<boolean>} true, если реально что-то подключено
 */
async function interactiveLink(root, { packages: fixedPackages } = {}) {
  const allPackages = layout.listPackages(root);
  if (allPackages.length === 0) {
    console.log('Нет ни одного пакета. Сначала pnpm run create:package');
    return false;
  }

  const apps = layout.listApps(root);
  const { checkbox, Separator } = await loadPrompts();

  const selectedChoicesLabel = (chosen) => chosen.map((c) => c.value.name).join(', ');

  // Потребители — apps И другие packages (пакеты тоже могут зависеть друг
  // от друга через workspace:*, см. tools/lib/monorepo-layout.js). Пакеты,
  // которые сами подключаются (fixedPackages), исключены из потребителей —
  // не может зависеть сам от себя.
  const fixedNames = fixedPackages ? new Set(fixedPackages.map((p) => p.name)) : null;
  const consumerPackages = fixedNames ? allPackages.filter((p) => !fixedNames.has(p.name)) : allPackages;

  const consumerChoices = [];
  if (apps.length > 0) {
    consumerChoices.push(new Separator('— Приложения —'));
    consumerChoices.push(...apps.map((a) => ({ name: `${a.relPosix} (${a.kind})`, value: a })));
  }
  if (consumerPackages.length > 0) {
    consumerChoices.push(new Separator('— Пакеты —'));
    consumerChoices.push(...consumerPackages.map((p) => ({ name: p.relPosix, value: p })));
  }

  const selectedConsumers = await checkbox({
    message: 'Куда подключить',
    choices: consumerChoices,
    theme: { style: { renderSelectedChoices: selectedChoicesLabel } },
  });

  if (selectedConsumers.length === 0) {
    console.log('Ничего не выбрано');
    return false;
  }

  let selectedPackages;
  if (fixedPackages) {
    selectedPackages = fixedPackages;
  } else {
    // Не фильтруем "уже подключено" здесь — при нескольких выбранных
    // потребителях это неоднозначно (у каждого свой набор уже подключённых),
    // linkPackage сама корректно пропускает уже существующие пары.
    selectedPackages = await checkbox({
      message: 'Пакеты для подключения',
      choices: allPackages.map((p) => ({ name: p.relPosix, value: p })),
      theme: { style: { renderSelectedChoices: selectedChoicesLabel } },
    });

    if (selectedPackages.length === 0) {
      console.log('Ничего не выбрано');
      return false;
    }
  }

  let linkedAny = false;
  for (const consumer of selectedConsumers) {
    for (const pkg of selectedPackages) {
      if (consumer.relPosix === pkg.relPosix) continue; // пакет не может зависеть сам от себя
      if (linkPackage(consumer, pkg)) linkedAny = true;
    }
  }
  return linkedAny;
}

async function interactiveFlow(root) {
  const linkedAny = await interactiveLink(root);
  if (!linkedAny) return;

  const { confirm } = await loadPrompts();
  const shouldInstall = await confirm({ message: 'Установить зависимости?', default: true });
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
      'Использование: pnpm run link:package -- <app> <package...> [--kind nest|vite] [--no-install]\n\n' +
        'Дописывает "@packages/<package>": "workspace:*" в dependencies указанного app\'а —\n' +
        'можно сразу несколько пакетов за раз. Тот же ручной шаг, который create:package\n' +
        'сейчас только подсказывает текстом.\n' +
        'Без аргументов — интерактивный выбор app\'а, затем пакетов (чекбоксами).\n\n' +
        'Примеры:\n' +
        '  pnpm run link:package -- api shared\n' +
        '  pnpm run link:package -- api shared utils --kind nest --no-install\n',
    );
    process.exit(0);
  }

  if (cli.appName && cli.packageNames.length > 0) {
    await namedFlow(root, cli);
    return;
  }

  if (cli.appName || cli.packageNames.length > 0) {
    console.error('❌ Нужны оба аргумента: <app> <package...> (или ни одного — для интерактивного режима)');
    process.exit(1);
  }

  await interactiveFlow(root);
}

module.exports = { linkPackage, interactiveLink };

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
