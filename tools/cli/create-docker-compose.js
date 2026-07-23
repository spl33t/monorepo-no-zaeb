#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { parseDockerCompose, stringifyDockerCompose } = require('../lib/docker-compose-parser');
const layout = require('../lib/monorepo-layout');

let rl = null;

function getRl() {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

function question(query) {
  return new Promise((resolve) => getRl().question(query, resolve));
}

/**
 * @param {string} root
 */
function getAvailableApps(root) {
  return layout
    .listApps(root)
    .filter((app) => fs.existsSync(path.join(app.absDir, 'Dockerfile')));
}

function validateEnvFile(app) {
  const envPath = path.join(app.absDir, '.env');

  if (!fs.existsSync(envPath)) {
    throw new Error(
      `Файл ${app.relPosix}/.env не найден. Создайте его на основе ${app.relPosix}/.env.example`,
    );
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const requiredVars = ['PORT'];
  const missingVars = [];

  for (const varName of requiredVars) {
    const regex = new RegExp(`^${varName}=`, 'm');
    if (!regex.test(content)) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    throw new Error(
      `В файле ${app.relPosix}/.env отсутствуют обязательные переменные: ${missingVars.join(', ')}`,
    );
  }
}

function getAppPort(app) {
  validateEnvFile(app);
  const envPath = path.join(app.absDir, '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const portMatch = content.match(/^PORT=(\d+)/m);
  if (portMatch) {
    return portMatch[1];
  }
  throw new Error(
    `В файле ${app.relPosix}/.env переменная PORT не содержит корректное значение (ожидается PORT=число)`,
  );
}

function createServiceConfig(app, port) {
  const toolchainRoot = layout.TOOLCHAINS[app.toolchain].root;
  const service = layout.composeServiceName(app.toolchain, app.name);
  return {
    build: {
      context: '.',
      dockerfile: `${toolchainRoot}/apps/${app.name}/Dockerfile`,
      target: '${DOCKER_TARGET:-development}',
    },
    container_name: service,
    ports: [`${port}:${port}`],
    env_file: [`${app.relPosix}/.env`],
    restart: 'unless-stopped',
    develop: {
      watch: [
        {
          action: 'sync',
          path: `./${toolchainRoot}/apps/${app.name}`,
          target: `/src/${toolchainRoot}/apps/${app.name}`,
        },
        {
          action: 'sync',
          path: `./${toolchainRoot}/packages`,
          target: `/src/${toolchainRoot}/packages`,
        },
        {
          action: 'sync',
          path: `./${layout.ROOT_PACKAGES_REL}`,
          target: `/src/${layout.ROOT_PACKAGES_REL}`,
        },
      ],
    },
  };
}

/**
 * @param {string|null} appNameArg
 * @param {'nestjs'|'vite'|null} worldHint
 * @param {string|null} repoRoot
 */
async function addAppToDockerCompose(appNameArg = null, worldHint = null, repoRoot = null) {
  const root = repoRoot || layout.findMonorepoRoot();
  const composePath = path.join(root, 'docker-compose.yml');
  let compose = { services: {}, networks: {}, volumes: {} };
  const isInteractive = appNameArg === null;
  const asCli = require.main === module;

  const fail = (message) => {
    console.error(`❌ ${message}`);
    if (rl) rl.close();
    if (asCli) process.exit(1);
    throw new Error(message);
  };

  if (fs.existsSync(composePath)) {
    try {
      compose = parseDockerCompose(composePath);
    } catch {
      console.error('⚠️  Ошибка при чтении docker-compose.yml, создам новый файл');
      compose = { services: {}, networks: {}, volumes: {} };
    }
  }

  let app = null;

  if (isInteractive) {
    console.log('\n🐳 Управление docker-compose.yml\n');

    if (fs.existsSync(composePath)) {
      console.log('📄 Найден существующий docker-compose.yml');
      console.log(`✅ Загружено ${Object.keys(compose.services).length} сервис(ов)\n`);
    } else {
      console.log('📄 docker-compose.yml не найден, будет создан новый файл\n');
    }

    const availableApps = getAvailableApps(root);
    console.log(`🔍 Найдено приложений: ${availableApps.length}`);

    if (availableApps.length === 0) {
      fail('Не найдено приложений с Dockerfile в nestjs-apps/apps или vite-apps/apps');
      return;
    }

    const existingServices = Object.keys(compose.services);
    if (existingServices.length > 0) {
      console.log('Существующие сервисы:');
      existingServices.forEach((name, index) => {
        console.log(`  ${index + 1}. ${name}`);
      });
      console.log('');
    }

    const appsToAdd = availableApps.filter(
      (a) => !existingServices.includes(layout.composeServiceName(a.toolchain, a.name)),
    );

    if (appsToAdd.length === 0) {
      console.log('✅ Все доступные приложения уже добавлены в docker-compose.yml');
      if (rl) rl.close();
      return;
    }

    console.log('Доступные приложения для добавления:');
    appsToAdd.forEach((a, index) => {
      try {
        const port = getAppPort(a);
        console.log(`  ${index + 1}. ${a.relPosix} (порт: ${port}, тип: ${a.toolchain})`);
      } catch (error) {
        console.log(`  ${index + 1}. ${a.relPosix} (ошибка: ${error.message})`);
      }
    });

    const choice = await question(`\nВыберите приложение для добавления [1-${appsToAdd.length}]: `);
    const appIndex = parseInt(choice, 10) - 1;

    if (isNaN(appIndex) || appIndex < 0 || appIndex >= appsToAdd.length) {
      fail(`Неверный выбор. Введите число от 1 до ${appsToAdd.length}`);
      return;
    }

    app = appsToAdd[appIndex];
  } else {
    if (worldHint) {
      const resolved = layout.resolveApp(worldHint, appNameArg, root);
      if (fs.existsSync(resolved.absDir)) {
        app = resolved;
      }
    }
    if (!app) {
      try {
        app = layout.findAppByName(appNameArg, root);
      } catch (error) {
        fail(error.message);
        return;
      }
    }
    if (!app) {
      fail(`Приложение "${appNameArg}" не найдено`);
      return;
    }
  }

  const service = layout.composeServiceName(app.toolchain, app.name);

  if (compose.services[service]) {
    console.log(`⚠️  Сервис "${service}" уже есть в docker-compose.yml`);
    if (rl) rl.close();
    return;
  }

  let port;
  try {
    port = getAppPort(app);
  } catch (error) {
    fail(`Ошибка при получении информации о "${app.relPosix}": ${error.message}`);
    return;
  }

  console.log(`\n📦 Добавляю "${app.relPosix}" → сервис ${service} (порт: ${port}, тип: ${app.toolchain})...`);

  compose.services[service] = createServiceConfig(app, port);

  try {
    fs.writeFileSync(composePath, stringifyDockerCompose(compose));
  } catch (error) {
    fail(`Ошибка при сохранении файла: ${error.message}`);
    return;
  }

  console.log(`✅ Сервис "${service}" добавлен в docker-compose.yml`);
  console.log(`\n📝 Файл сохранен: ${composePath}`);

  if (isInteractive) {
    console.log('\n💡 Watch Mode отслеживает:');
    console.log(`   - ${app.relPosix}/`);
    console.log(`   - ${layout.TOOLCHAINS[app.toolchain].packagesRel}/`);
    rl.close();
  }
}

async function createDockerCompose() {
  const appNameArg = process.argv[2];
  await addAppToDockerCompose(appNameArg || null);
}

module.exports = { addAppToDockerCompose };

if (require.main === module) {
  createDockerCompose().catch((err) => {
    console.error('❌ Ошибка:', err.message);
    if (rl) rl.close();
    process.exit(1);
  });
}
