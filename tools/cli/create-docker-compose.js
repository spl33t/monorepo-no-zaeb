#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { parseDockerCompose, stringifyDockerCompose } = require('../lib/docker-compose-parser');
const layout = require('../lib/monorepo-layout');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
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

function getAppType(app) {
  try {
    if (app.world === 'vite') return 'vite';
    if (fs.existsSync(path.join(app.absDir, 'vite.config.ts'))) return 'vite';
    return 'node';
  } catch (error) {
    console.warn(`⚠️  Ошибка при определении типа для ${app.name}: ${error.message}`);
    return 'node';
  }
}

function createServiceConfig(app, port) {
  const toolchain = layout.TOOLCHAINS[app.world].root;
  return {
    build: {
      context: `./${toolchain}`,
      dockerfile: `apps/${app.name}/Dockerfile`,
      target: '${DOCKER_TARGET:-development}',
    },
    container_name: app.name,
    ports: [`${port}:${port}`],
    env_file: [`${app.relPosix}/.env`],
    restart: 'unless-stopped',
    develop: {
      watch: [
        {
          action: 'sync',
          path: `./${toolchain}/apps/${app.name}`,
          target: `/app/apps/${app.name}`,
        },
        {
          action: 'sync',
          path: `./${toolchain}/packages`,
          target: `/app/packages`,
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
    if (isInteractive) rl.close();
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

    const appsToAdd = availableApps.filter((a) => !existingServices.includes(a.name));

    if (appsToAdd.length === 0) {
      console.log('✅ Все доступные приложения уже добавлены в docker-compose.yml');
      rl.close();
      return;
    }

    console.log('Доступные приложения для добавления:');
    appsToAdd.forEach((a, index) => {
      try {
        const port = getAppPort(a);
        const type = getAppType(a);
        console.log(`  ${index + 1}. ${a.relPosix} (порт: ${port}, тип: ${type})`);
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
      const abs = layout.appDir(worldHint, appNameArg, root);
      if (fs.existsSync(abs)) {
        app = {
          world: worldHint,
          name: appNameArg,
          absDir: abs,
          relPosix: layout.appRelPosix(worldHint, appNameArg),
        };
      }
    }
    if (!app) {
      app = layout.findAppByName(appNameArg, root);
    }
    if (!app) {
      fail(`Приложение "${appNameArg}" не найдено`);
      return;
    }
  }

  if (compose.services[app.name]) {
    console.log(`⚠️  Приложение "${app.name}" уже добавлено в docker-compose.yml`);
    if (isInteractive) rl.close();
    return;
  }

  let port;
  let appType;
  try {
    port = getAppPort(app);
    appType = getAppType(app);
  } catch (error) {
    fail(`Ошибка при получении информации о "${app.name}": ${error.message}`);
    return;
  }

  console.log(`\n📦 Добавляю "${app.relPosix}" (порт: ${port}, тип: ${appType})...`);

  compose.services[app.name] = createServiceConfig(app, port);

  try {
    fs.writeFileSync(composePath, stringifyDockerCompose(compose));
  } catch (error) {
    fail(`Ошибка при сохранении файла: ${error.message}`);
    return;
  }

  console.log(`✅ Приложение "${app.name}" добавлено в docker-compose.yml`);
  console.log(`\n📝 Файл сохранен: ${composePath}`);

  if (isInteractive) {
    console.log('\n💡 Watch Mode отслеживает:');
    console.log(`   - ${app.relPosix}/`);
    console.log(`   - ${layout.TOOLCHAINS[app.world].packagesRel}/`);
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
