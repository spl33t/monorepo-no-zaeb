#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { parseDockerCompose, stringifyDockerCompose } = require('./docker-compose-parser');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}


/**
 * Получает список доступных приложений
 */
function getAvailableApps() {
  const appsDir = path.join(process.cwd(), 'apps');
  if (!fs.existsSync(appsDir)) {
    return [];
  }

  const apps = fs.readdirSync(appsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => {
      const dockerfilePath = path.join(appsDir, name, 'Dockerfile');
      return fs.existsSync(dockerfilePath);
    });

  return apps;
}

/**
 * Проверяет обязательные переменные в .env файле
 */
function validateEnvFile(appName) {
  const appDir = path.join(process.cwd(), 'apps', appName);
  const envPath = path.join(appDir, '.env');
  
  if (!fs.existsSync(envPath)) {
    throw new Error(`Файл apps/${appName}/.env не найден. Создайте его на основе apps/${appName}/.env.example`);
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
    throw new Error(`В файле apps/${appName}/.env отсутствуют обязательные переменные: ${missingVars.join(', ')}`);
  }
}

/**
 * Получает порт приложения из .env файла
 */
function getAppPort(appName) {
  try {
    const appDir = path.join(process.cwd(), 'apps', appName);
    
    // Проверяем наличие и валидность .env файла
    validateEnvFile(appName);
    
    // Пробуем получить из .env файла
    const envPath = path.join(appDir, '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const portMatch = content.match(/^PORT=(\d+)/m);
    if (portMatch) {
      return portMatch[1];
    }

    // Если PORT не найден в .env (хотя должен быть по валидации), это ошибка
    throw new Error(`В файле apps/${appName}/.env переменная PORT не содержит корректное значение (ожидается PORT=число)`);
  } catch (error) {
    // Пробрасываем все ошибки дальше
    throw error;
  }
}

/**
 * Определяет тип приложения (nodejs/nestjs/vite)
 */
function getAppType(appName) {
  try {
    const appDir = path.join(process.cwd(), 'apps', appName);
    const packageJsonPath = path.join(appDir, 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Проверяем зависимости
      if (packageJson.dependencies) {
        if (packageJson.dependencies['@nestjs/core']) {
          return 'nestjs';
        }
        if (packageJson.dependencies['react'] || packageJson.dependencies['react-dom']) {
          return 'vite';
        }
      }
      
      // Проверяем наличие vite.config.ts
      if (fs.existsSync(path.join(appDir, 'vite.config.ts'))) {
        return 'vite';
      }
    }

    return 'nodejs';
  } catch (error) {
    console.warn(`⚠️  Ошибка при определении типа для ${appName}: ${error.message}`);
    return 'nodejs';
  }
}

/**
 * Создает конфигурацию сервиса для docker-compose
 */
function createServiceConfig(appName, port, appType) {
  // Используем Dockerfile с таргетами (development по умолчанию)
  const dockerfilePath = `apps/${appName}/Dockerfile`;
  const contextPath = '.';
  
  const service = {
    build: {
      context: contextPath,
      dockerfile: dockerfilePath,
      target: '${DOCKER_TARGET:-development}'
    },
    container_name: appName,
    ports: [`${port}:${port}`],
    env_file: [
      `apps/${appName}/.env`
    ],
    restart: 'unless-stopped',
    develop: {
      watch: [
        {
          action: 'sync',
          path: `./apps/${appName}`,
          target: `/app/apps/${appName}`
        },
        {
          action: 'sync',
          path: `./packages`,
          target: `/app/packages`
        }
      ]
    }
  };

  // Для Vite приложений:
  // - В development: используем порт из .env (Vite dev server)
  // - В production: используем порт из .env (nginx настроен на этот порт через ARG PORT)
  if (appType === 'vite') {
    // И в development, и в production используем порт из .env
    service.ports = [`${port}:${port}`];
  }

  return service;
}

async function createDockerCompose() {
  console.log('\n🐳 Управление docker-compose.yml\n');

  const composePath = path.join(process.cwd(), 'docker-compose.yml');
  let compose = { services: {}, networks: {}, volumes: {} };

  // Читаем существующий файл если есть
  if (fs.existsSync(composePath)) {
    console.log('📄 Найден существующий docker-compose.yml');
    try {
      compose = parseDockerCompose(composePath);
      console.log(`✅ Загружено ${Object.keys(compose.services).length} сервис(ов)\n`);
    } catch (error) {
      console.error('⚠️  Ошибка при чтении docker-compose.yml, создам новый файл');
      compose = { services: {}, networks: {}, volumes: {} };
    }
  } else {
    console.log('📄 docker-compose.yml не найден, будет создан новый файл\n');
  }

  // Получаем список доступных приложений
  let availableApps;
  try {
    availableApps = getAvailableApps();
    console.log(`🔍 Найдено приложений: ${availableApps.length}`);
  } catch (error) {
    console.error('❌ Ошибка при получении списка приложений:', error.message);
    console.error(error.stack);
    rl.close();
    process.exit(1);
  }
  
  if (availableApps.length === 0) {
    console.error('❌ Не найдено приложений с Dockerfile в папке apps/');
    rl.close();
    process.exit(1);
  }

  // Показываем существующие сервисы
  const existingServices = Object.keys(compose.services);
  if (existingServices.length > 0) {
    console.log('Существующие сервисы:');
    existingServices.forEach((name, index) => {
      console.log(`  ${index + 1}. ${name}`);
    });
    console.log('');
  }

  // Показываем доступные приложения
  const appsToAdd = availableApps.filter(app => !existingServices.includes(app));
  
  if (appsToAdd.length === 0) {
    console.log('✅ Все доступные приложения уже добавлены в docker-compose.yml');
    rl.close();
    return;
  }

  console.log('Доступные приложения для добавления:');
  appsToAdd.forEach((app, index) => {
    try {
      const port = getAppPort(app);
      const type = getAppType(app);
      console.log(`  ${index + 1}. ${app} (порт: ${port}, тип: ${type})`);
    } catch (error) {
      console.log(`  ${index + 1}. ${app} (ошибка получения информации: ${error.message})`);
    }
  });

  // Выбор приложения
  let choice;
  try {
    choice = await question(`\nВыберите приложение для добавления [1-${appsToAdd.length}]: `);
  } catch (error) {
    console.error('❌ Ошибка при чтении ввода:', error.message);
    rl.close();
    process.exit(1);
  }
  
  const appIndex = parseInt(choice) - 1;

  if (isNaN(appIndex) || appIndex < 0 || appIndex >= appsToAdd.length) {
    console.error(`❌ Неверный выбор. Введите число от 1 до ${appsToAdd.length}`);
    rl.close();
    process.exit(1);
  }

  const appName = appsToAdd[appIndex];
  const port = getAppPort(appName);
  const appType = getAppType(appName);

  console.log(`\n📦 Добавляю приложение "${appName}" (порт: ${port}, тип: ${appType})...`);

  // Создаем конфигурацию сервиса
  let serviceConfig;
  try {
    serviceConfig = createServiceConfig(appName, port, appType);
  } catch (error) {
    console.error(`❌ Ошибка при создании конфигурации сервиса: ${error.message}`);
    rl.close();
    process.exit(1);
  }
  
  compose.services[appName] = serviceConfig;

  // Сохраняем docker-compose.yml
  try {
    const yamlContent = stringifyDockerCompose(compose);
    fs.writeFileSync(composePath, yamlContent);
  } catch (error) {
    console.error(`❌ Ошибка при сохранении файла: ${error.message}`);
    rl.close();
    process.exit(1);
  }

  console.log(`✅ Приложение "${appName}" добавлено в docker-compose.yml`);
  console.log(`\n📝 Файл сохранен: ${composePath}`);
  console.log('\n💡 Доступные команды:');
  console.log(`   docker compose up -d ${appName}                    # Запустить сервис (development, фоновый режим)`);
  console.log(`   docker compose up --watch ${appName}                # Запустить с watch mode (development)`);
  console.log(`   DOCKER_TARGET=production docker compose up ${appName}  # Запустить с production таргетом`);
  console.log(`   docker compose build --target development ${appName} # Собрать development образ`);
  console.log(`   docker compose build --target production ${appName}   # Собрать production образ`);
  console.log(`   docker compose logs -f ${appName}                   # Просмотр логов`);
  console.log(`   docker compose ps                                   # Показать статус контейнеров`);
  console.log(`   docker compose down                                 # Остановить все сервисы`);
  console.log('\n🔄 Watch Mode отслеживает изменения в:');
  console.log(`   - Директории приложения (apps/${appName}/) - синхронизация`);
  console.log('   - Директории packages/ - синхронизация');
  console.log('\n📝 Примечание:');
  console.log('   - По умолчанию используется таргет "development" из Dockerfile');
  console.log('   - Переопределить таргет: DOCKER_TARGET=production docker compose up');
  console.log('   - Для production используйте переменную DOCKER_TARGET=production');
  console.log('   - Watch mode автоматически синхронизирует изменения и пересобирает контейнеры');

  rl.close();
}

createDockerCompose().catch(err => {
  console.error('❌ Ошибка:', err.message);
  rl.close();
  process.exit(1);
});

