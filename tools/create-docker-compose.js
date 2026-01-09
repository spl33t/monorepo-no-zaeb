#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

/**
 * Парсит простой YAML (без библиотек для минимальных зависимостей)
 * Работает только с базовыми структурами docker-compose
 */
function parseYaml(content) {
  const result = { version: '3.8', services: {}, networks: {}, volumes: {} };
  const lines = content.split('\n');
  let currentSection = null;
  let currentService = null;
  let serviceContent = {};
  let currentKey = null;
  let currentObject = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Определяем уровень отступа
    const indent = line.match(/^(\s*)/)[1].length;
    
    // Версия
    if (trimmed.startsWith('version:')) {
      result.version = trimmed.split(':')[1].trim().replace(/['"]/g, '');
      continue;
    }

    // Секции
    if (trimmed === 'services:' || trimmed === 'networks:' || trimmed === 'volumes:') {
      if (currentService) {
        result.services[currentService] = serviceContent;
      }
      currentSection = trimmed.replace(':', '');
      currentService = null;
      serviceContent = {};
      currentKey = null;
      currentObject = null;
      continue;
    }

    // Сервис
    if (currentSection === 'services' && indent === 2 && trimmed.endsWith(':')) {
      if (currentService) {
        result.services[currentService] = serviceContent;
      }
      currentService = trimmed.replace(':', '').trim();
      serviceContent = {};
      currentKey = null;
      currentObject = null;
      continue;
    }

    // Параметры сервиса (indent >= 4)
    if (currentService && currentSection === 'services' && indent >= 4) {
      const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
      if (match) {
        const key = match[2].trim();
        const value = match[3].trim();
        
        // Если это вложенный объект (следующая строка с большим отступом)
        if (indent === 4 && value === '' && i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextIndent = nextLine.match(/^(\s*)/)[1].length;
          if (nextIndent > indent) {
            currentKey = key;
            currentObject = {};
            serviceContent[key] = currentObject;
            continue;
          }
        }
        
        // Если мы внутри объекта (indent === 6)
        if (indent === 6 && currentObject) {
          currentObject[key] = value.replace(/^['"]|['"]$/g, '');
          continue;
        }
        
        // Обычное значение или массив
        if (indent === 4) {
          currentKey = null;
          currentObject = null;
          
          // Проверяем массив (начинается с -)
          if (value.startsWith('-')) {
            const arrayValue = value.substring(1).trim().replace(/^['"]|['"]$/g, '');
            if (!serviceContent[key]) {
              serviceContent[key] = [];
            }
            serviceContent[key].push(arrayValue);
          } else if (value === '' && i + 1 < lines.length) {
            // Пустое значение может означать массив или объект
            const nextLine = lines[i + 1];
            const nextIndent = nextLine.match(/^(\s*)/)[1].length;
            const nextTrimmed = nextLine.trim();
            if (nextIndent === 6 && nextTrimmed.startsWith('-')) {
              // Это массив
              serviceContent[key] = [];
              // Пропускаем эту итерацию, обработаем в следующей
              continue;
            }
          } else {
            serviceContent[key] = value.replace(/^['"]|['"]$/g, '');
          }
        }
        
        // Элементы массива (indent === 6, начинается с -)
        if (indent === 6 && trimmed.startsWith('-')) {
          const arrayValue = trimmed.substring(1).trim().replace(/^['"]|['"]$/g, '');
          // Находим последний ключ, который был массивом
          const lastKey = Object.keys(serviceContent).pop();
          if (lastKey && Array.isArray(serviceContent[lastKey])) {
            serviceContent[lastKey].push(arrayValue);
          } else if (currentKey && serviceContent[currentKey] && Array.isArray(serviceContent[currentKey])) {
            serviceContent[currentKey].push(arrayValue);
          }
        }
      }
    }
  }

  // Добавляем последний сервис
  if (currentService) {
    result.services[currentService] = serviceContent;
  }

  return result;
}

/**
 * Преобразует объект обратно в YAML
 */
function stringifyYaml(obj) {
  // version больше не нужен в новых версиях docker compose
  let result = '';
  
  if (Object.keys(obj.services).length > 0) {
    result += 'services:\n';
    for (const [name, service] of Object.entries(obj.services)) {
      result += `  ${name}:\n`;
      for (const [key, value] of Object.entries(service)) {
        if (Array.isArray(value)) {
          result += `    ${key}:\n`;
          value.forEach(item => {
            // Если элемент массива - строка, добавляем как есть
            if (typeof item === 'string') {
              result += `      - ${item}\n`;
            } else if (typeof item === 'object' && item !== null) {
              // Объект в массиве (например, watch items)
              result += `      - action: ${item.action}\n`;
              result += `        path: ${item.path}\n`;
              if (item.target) {
                result += `        target: ${item.target}\n`;
              }
            } else {
              result += `      - ${JSON.stringify(item)}\n`;
            }
          });
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          result += `    ${key}:\n`;
          for (const [k, v] of Object.entries(value)) {
            if (Array.isArray(v)) {
              // Массив внутри объекта (например, develop.watch)
              result += `      ${k}:\n`;
              v.forEach(item => {
                if (typeof item === 'object' && item !== null) {
                  result += `        - action: ${item.action}\n`;
                  result += `          path: ${item.path}\n`;
                  if (item.target) {
                    result += `          target: ${item.target}\n`;
                  }
                } else {
                  result += `        - ${item}\n`;
                }
              });
            } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
              // Вложенный объект (например, build.args)
              result += `      ${k}:\n`;
              for (const [nk, nv] of Object.entries(v)) {
                const val = typeof nv === 'string' && (nv.includes(':') || nv.includes(' ')) ? `'${nv}'` : nv;
                result += `        ${nk}: ${val}\n`;
              }
            } else {
              // Экранируем значения если нужно
              const val = typeof v === 'string' && (v.includes(':') || v.includes(' ')) ? `'${v}'` : v;
              result += `      ${k}: ${val}\n`;
            }
          }
        } else {
          // Экранируем строковые значения если нужно
          const val = typeof value === 'string' && (value.includes(':') || value.includes(' ')) ? `'${value}'` : value;
          result += `    ${key}: ${val}\n`;
        }
      }
      result += '\n';
    }
  }

  if (Object.keys(obj.networks || {}).length > 0) {
    result += '\nnetworks:\n';
    for (const [name, network] of Object.entries(obj.networks)) {
      result += `  ${name}:\n`;
      if (typeof network === 'object' && network !== null) {
        for (const [key, value] of Object.entries(network)) {
          result += `    ${key}: ${value}\n`;
        }
      }
    }
  }

  if (Object.keys(obj.volumes || {}).length > 0) {
    result += '\nvolumes:\n';
    for (const [name, volume] of Object.entries(obj.volumes)) {
      result += `  ${name}:\n`;
      if (typeof volume === 'object' && volume !== null) {
        for (const [key, value] of Object.entries(volume)) {
          result += `    ${key}: ${value}\n`;
        }
      }
    }
  }

  return result;
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

  // Для Vite приложений порт всегда 80
  if (appType === 'vite') {
    service.ports = [`${port}:80`];
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
    const content = fs.readFileSync(composePath, 'utf8');
    try {
      compose = parseYaml(content);
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
    const yamlContent = stringifyYaml(compose);
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

