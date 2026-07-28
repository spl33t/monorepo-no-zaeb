#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { parseDockerCompose, stringifyDockerCompose } = require('../lib/docker-compose-parser');
const layout = require('../lib/monorepo-layout');

/**
 * `@inquirer/prompts` — ESM-only с v8, грузится через динамический `import()`
 * — стандартный мост ESM→CJS в Node.
 * @returns {Promise<{ select: Function }>}
 */
function loadPrompts() {
  return import('@inquirer/prompts');
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
  const service = layout.composeServiceName(app.kind, app.name);
  return {
    build: {
      context: '.',
      dockerfile: `apps/${app.name}/Dockerfile`,
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
          path: `./${app.relPosix}`,
          target: `/src/${app.relPosix}`,
        },
        {
          action: 'sync',
          path: `./${layout.PACKAGES_REL}`,
          target: `/src/${layout.PACKAGES_REL}`,
        },
      ],
    },
  };
}

/**
 * @param {string|null} appNameArg
 * @param {string|null} repoRoot
 */
async function addAppToDockerCompose(appNameArg = null, repoRoot = null) {
  const root = repoRoot || layout.findMonorepoRoot();
  const composePath = path.join(root, 'docker-compose.yml');
  let compose = { services: {}, networks: {}, volumes: {} };
  const isInteractive = appNameArg === null;
  const asCli = require.main === module;

  const fail = (message) => {
    console.error(`❌ ${message}`);
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
      fail('Не найдено приложений с Dockerfile в apps/');
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
      (a) => !existingServices.includes(layout.composeServiceName(a.kind, a.name)),
    );

    if (appsToAdd.length === 0) {
      console.log('✅ Все доступные приложения уже добавлены в docker-compose.yml');
      return;
    }

    const { select } = await loadPrompts();
    app = await select({
      message: 'Выберите приложение для добавления',
      choices: appsToAdd.map((a) => {
        let label;
        try {
          const port = getAppPort(a);
          label = `${a.relPosix} (порт: ${port}, тип: ${a.kind})`;
        } catch (error) {
          label = `${a.relPosix} (ошибка: ${error.message})`;
        }
        return { name: label, value: a };
      }),
    });
  } else {
    try {
      app = layout.findAppByName(appNameArg, root);
    } catch (error) {
      fail(error.message);
      return;
    }
    if (!app) {
      fail(`Приложение "${appNameArg}" не найдено`);
      return;
    }
  }

  const service = layout.composeServiceName(app.kind, app.name);

  if (compose.services[service]) {
    console.log(`⚠️  Сервис "${service}" уже есть в docker-compose.yml`);
    return;
  }

  let port;
  try {
    port = getAppPort(app);
  } catch (error) {
    fail(`Ошибка при получении информации о "${app.relPosix}": ${error.message}`);
    return;
  }

  console.log(`\n📦 Добавляю "${app.relPosix}" → сервис ${service} (порт: ${port}, тип: ${app.kind})...`);

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
    console.log(`   - ${layout.PACKAGES_REL}/`);
  }
}

async function createDockerCompose() {
  const appNameArg = process.argv[2];
  await addAppToDockerCompose(appNameArg || null);
}

module.exports = { addAppToDockerCompose };

if (require.main === module) {
  createDockerCompose().catch((err) => {
    if (err?.name === 'ExitPromptError') {
      console.log('\nОтменено');
      process.exit(0);
    }
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  });
}
