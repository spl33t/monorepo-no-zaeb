#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const layout = require('../lib/monorepo-layout');
const { parseDockerCompose, stringifyDockerCompose } = require('../lib/docker-compose-parser');

let rl = null;

function getRl() {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

function question(query) {
  return new Promise((resolve) => getRl().question(query, resolve));
}

function parseArgv(argv) {
  const out = { help: false, noInstall: false, yes: false, toolchain: undefined, name: undefined };
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
    if (a === '--toolchain') {
      out.toolchain = argv[++i];
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
 * @param {ReturnType<typeof layout.resolveApp>} app
 * @param {string} root
 */
function removeApp(app, root) {
  const service = layout.composeServiceName(app.toolchain, app.name);
  const removedFromCompose = removeFromDockerCompose(root, service);
  fs.rmSync(app.absDir, { recursive: true, force: true });
  console.log(`✅ Удалено: ${app.relPosix}`);
  if (removedFromCompose) {
    console.log(`✅ Сервис "${service}" убран из docker-compose.yml`);
  }
}

async function maybeInstall(toolchainRoot, shouldInstall) {
  const label = path.basename(toolchainRoot);
  if (!shouldInstall) {
    console.log(`\n⏭️  Пропущена установка. Вручную: npm install (в ${label}/)`);
    return;
  }
  console.log(`\n📦 npm install (${label})...`);
  try {
    execSync('npm install', { stdio: 'inherit', cwd: toolchainRoot });
    console.log('\n✅ Готово');
  } catch {
    console.warn(`\n⚠️  Установите вручную: npm install (в ${label}/)`);
  }
}

async function namedFlow(root, cli) {
  let app;
  try {
    app = layout.findAppByName(cli.name, root, cli.toolchain);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
  if (!app) {
    console.error(`❌ Приложение "${cli.name}" не найдено`);
    process.exit(1);
  }

  if (!cli.yes) {
    const answer = await question(`Удалить ${app.relPosix}? (y/n) [n]: `);
    if (rl) rl.close();
    if (!/^y(es)?$/i.test((answer || '').trim())) {
      console.log('Отменено');
      return;
    }
  }

  const toolchainRoot = path.join(root, layout.TOOLCHAINS[app.toolchain].root);
  removeApp(app, root);
  await maybeInstall(toolchainRoot, !cli.noInstall);
}

async function interactiveFlow(root) {
  const apps = layout.listApps(root);
  if (apps.length === 0) {
    console.log('Нет ни одного приложения для удаления.');
    return;
  }

  console.log('\n🗑️  Удаление приложения\n');
  apps.forEach((a, i) => console.log(`  ${i + 1}. ${a.relPosix} (${a.toolchain})`));

  const choice = await question(`\nНомер [1-${apps.length}]: `);
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= apps.length) {
    console.error('❌ Неверный выбор');
    if (rl) rl.close();
    process.exit(1);
  }

  const app = apps[idx];
  const confirm = await question(`Удалить ${app.relPosix}? (y/n) [n]: `);
  if (!/^y(es)?$/i.test((confirm || '').trim())) {
    console.log('Отменено');
    if (rl) rl.close();
    return;
  }

  const toolchainRoot = path.join(root, layout.TOOLCHAINS[app.toolchain].root);
  removeApp(app, root);
  const install = (await question('Установить зависимости заново? (y/n) [y]: ')) || 'y';
  if (rl) rl.close();
  await maybeInstall(toolchainRoot, /^y(es)?$/i.test(install.trim()));
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
      'Использование: npm run remove:app -- <name> [--toolchain nestjs|vite] [--no-install] [--yes]\n\n' +
        'Удаляет приложение: папку, сервис в docker-compose.yml, опционально — npm install для чистки lockfile.\n' +
        'Без аргументов — интерактивный выбор из списка существующих приложений.\n\n' +
        'Примеры:\n' +
        '  npm run remove:app -- api\n' +
        '  npm run remove:app -- api --toolchain nestjs --yes\n',
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
    console.error('❌ Ошибка:', err.message);
    if (rl) rl.close();
    process.exit(1);
  });
}
