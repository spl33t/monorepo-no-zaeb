#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const layout = require('../lib/monorepo-layout');
const { parseDockerCompose, stringifyDockerCompose } = require('../lib/docker-compose-parser');
const { createServiceConfig, getAppPort } = require('./create-docker-compose');

/**
 * `@inquirer/prompts` — ESM-only с v8, грузится через динамический `import()`
 * — стандартный мост ESM→CJS в Node.
 * @returns {Promise<{ select: Function, input: Function, confirm: Function }>}
 */
function loadPrompts() {
  return import('@inquirer/prompts');
}

function parseArgv(argv) {
  const out = {
    help: false,
    noInstall: false,
    yes: false,
    kind: undefined,
    oldName: undefined,
    newName: undefined,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
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
    if (a === '--kind') {
      out.kind = argv[++i];
      continue;
    }
    if (a.startsWith('-')) throw new Error(`Неизвестный флаг: ${a}`);
    positional.push(a);
  }
  out.oldName = positional[0];
  out.newName = positional[1];
  return out;
}

function validateName(name) {
  return Boolean(name && /^[a-z0-9-]+$/.test(name));
}

/**
 * Если у app'а уже есть сервис в docker-compose.yml — убирает его под старым
 * именем и создаёт заново под новым, через ту же createServiceConfig, что и
 * docker:create-compose (не дублирует формат сервиса вручную). Порт и .env
 * читаются уже из НОВОГО расположения — на момент вызова папка уже
 * переименована. Если .env почему-то не читается (не должно случаться —
 * переехал вместе с папкой), сервис остаётся убранным, а не оставленным под
 * старым именем/путями (битым): предупреждает и просит добавить вручную.
 * @param {string} root
 * @param {{ kind: string, name: string, absDir: string, relPosix: string }} oldApp
 * @param {{ kind: string, name: string, absDir: string, relPosix: string }} newApp
 */
function renameDockerComposeService(root, oldApp, newApp) {
  const composePath = path.join(root, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) return;

  let compose;
  try {
    compose = parseDockerCompose(composePath);
  } catch {
    return;
  }
  if (!compose.services) return;

  const oldService = layout.composeServiceName(oldApp.kind, oldApp.name);
  const newService = layout.composeServiceName(newApp.kind, newApp.name);
  if (!compose.services[oldService]) return;

  delete compose.services[oldService];

  try {
    const port = getAppPort(newApp);
    compose.services[newService] = createServiceConfig(newApp, port);
    fs.writeFileSync(composePath, stringifyDockerCompose(compose));
    console.log(`✅ Сервис "${oldService}" → "${newService}" в docker-compose.yml`);
  } catch (error) {
    fs.writeFileSync(composePath, stringifyDockerCompose(compose));
    console.warn(
      `⚠️  Сервис "${oldService}" убран из docker-compose.yml, но не пересоздан под новым именем` +
        ` (${error.message}). Добавь вручную: pnpm run docker:create-compose -- ${newApp.name}`,
    );
  }
}

/**
 * Dockerfile жёстко зашивает apps/<name> как путь: COPY, WORKDIR, `pnpm
 * --filter "{apps/<name>}..."`, комментарий `docker build -f apps/<name>/...`
 * (см. tools/generators/{nest,vite}/dockerfile.js). Папка на этот момент уже
 * переехала на новое место (fs.renameSync выше переносит её целиком), но
 * содержимое файла всё ещё ссылается на СТАРЫЙ путь, которого больше не
 * существует — образ бы не собрался. Точечная строковая замена подпути (не
 * полная регенерация через generateNodeDockerfile/generateViteDockerfile) —
 * чтобы не потерять ручные правки Dockerfile, если они были (лишний RUN
 * apt-get и т.п.). Regex с негативным lookahead на [a-z0-9-] — не голая
 * подстрока: без границы "apps/api" ложно задел бы "apps/api-gateway" —
 * чужой app, у которого имя просто начинается с того же префикса.
 * @param {{ absDir: string }} newApp
 * @param {string} oldName
 * @param {string} newName
 */
function updateDockerfileAppName(newApp, oldName, newName) {
  const dockerfilePath = path.join(newApp.absDir, 'Dockerfile');
  if (!fs.existsSync(dockerfilePath)) return;

  const content = fs.readFileSync(dockerfilePath, 'utf8');
  const pattern = new RegExp(`apps/${oldName}(?![a-z0-9-])`, 'g');
  const next = content.replace(pattern, `apps/${newName}`);
  if (next === content) return;

  fs.writeFileSync(dockerfilePath, next);
  console.log(`✅ Dockerfile: apps/${oldName} → apps/${newName}`);
}

/**
 * Переименовывает apps/<old> → apps/<new>: саму папку, "name" в package.json,
 * пути apps/<old> внутри Dockerfile и сервис в docker-compose.yml (если app
 * там уже был). Ссылки на "@apps/<name>" нигде не ищет и не правит — в
 * отличие от packages/*, apps не воркспейс-зависимость друг для друга или
 * для packages/*: ни один сгенерированный package.json не пишет
 * "@apps/<name>": "workspace:*" (apps — деплоймые юниты, не библиотеки для
 * импорта).
 * @param {string} root
 * @param {{ kind: string, name: string, absDir: string, relPosix: string }} app
 * @param {string} newName
 */
function renameApp(root, app, newName) {
  const newDir = path.join(root, layout.APPS_REL, newName);
  if (fs.existsSync(newDir)) {
    throw new Error(`Приложение "${newName}" уже существует`);
  }

  fs.renameSync(app.absDir, newDir);

  const pkgJsonPath = path.join(newDir, 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  pkgJson.name = `@apps/${newName}`;
  fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);

  const newApp = { kind: app.kind, name: newName, absDir: newDir, relPosix: `${layout.APPS_REL}/${newName}` };
  console.log(`✅ ${app.relPosix} → ${newApp.relPosix}`);

  updateDockerfileAppName(newApp, app.name, newName);
  renameDockerComposeService(root, app, newApp);

  return newApp;
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
  let app;
  try {
    app = layout.findAppByName(cli.oldName, root, cli.kind);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
  if (!app) {
    console.error(`❌ Приложение "${cli.oldName}" не найдено`);
    process.exit(1);
  }
  if (!validateName(cli.newName)) {
    console.error('❌ Название: только a-z, 0-9, -');
    process.exit(1);
  }
  if (cli.newName === cli.oldName) {
    console.error('❌ Новое название совпадает со старым');
    process.exit(1);
  }

  if (!cli.yes) {
    const { confirm } = await loadPrompts();
    const proceed = await confirm({
      message: `Переименовать ${app.relPosix} → apps/${cli.newName}?`,
      default: false,
    });
    if (!proceed) {
      console.log('Отменено');
      return;
    }
  }

  renameApp(root, app, cli.newName);
  await maybeInstall(root, !cli.noInstall);
}

async function interactiveFlow(root) {
  const apps = layout.listApps(root);
  if (apps.length === 0) {
    console.log('Нет ни одного приложения для переименования.');
    return;
  }

  const { select, input, confirm } = await loadPrompts();

  console.log('\n✏️  Переименование приложения\n');
  const app = await select({
    message: 'Какое приложение переименовать',
    choices: apps.map((a) => ({ name: `${a.relPosix} (${a.kind})`, value: a })),
  });

  const newName = await input({
    message: 'Новое название',
    default: app.name,
    validate: (value) => {
      const trimmed = value.trim();
      if (!validateName(trimmed)) return 'Только a-z, 0-9, -';
      if (trimmed === app.name) return 'Совпадает с текущим названием';
      if (apps.some((a) => a.name === trimmed && a.kind === app.kind)) {
        return `Приложение "${trimmed}" уже существует`;
      }
      return true;
    },
  });

  const trimmedName = newName.trim();
  const proceed = await confirm({
    message: `Переименовать ${app.relPosix} → apps/${trimmedName}?`,
    default: false,
  });
  if (!proceed) {
    console.log('Отменено');
    return;
  }

  renameApp(root, app, trimmedName);
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
      'Использование: pnpm run rename:app -- <old-name> <new-name> [--kind nest|vite] [--no-install] [--yes]\n\n' +
        'Переименовывает apps/<old> → apps/<new>: папку, "name" в package.json, пути apps/<old>\n' +
        'внутри Dockerfile и сервис в docker-compose.yml (если app уже был добавлен через\n' +
        'docker:create-compose).\n' +
        'Без аргументов — интерактивный выбор приложения и ввод нового названия.\n\n' +
        'Примеры:\n' +
        '  pnpm run rename:app -- api gateway\n' +
        '  pnpm run rename:app -- api gateway --kind nest --yes\n',
    );
    process.exit(0);
  }

  if (cli.oldName && cli.newName) {
    await namedFlow(root, cli);
    return;
  }

  if (cli.oldName || cli.newName) {
    console.error(
      '❌ Нужны оба аргумента: <old-name> <new-name> (или ни одного — для интерактивного режима)',
    );
    process.exit(1);
  }

  await interactiveFlow(root);
}

module.exports = { renameApp };

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
