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
 * Получает порт приложения из .env.example или Dockerfile
 */
function getAppPort(appName) {
  const appDir = path.join(process.cwd(), 'apps', appName);
  
  // Пробуем получить из .env.example
  const envExamplePath = path.join(appDir, '.env.example');
  if (fs.existsSync(envExamplePath)) {
    const content = fs.readFileSync(envExamplePath, 'utf8');
    const portMatch = content.match(/^PORT=(\d+)/m);
    if (portMatch) {
      return portMatch[1];
    }
  }

  // Пробуем получить из Dockerfile
  const dockerfilePath = path.join(appDir, 'Dockerfile');
  if (fs.existsSync(dockerfilePath)) {
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    const portMatch = content.match(/ENV PORT=(\d+)/);
    if (portMatch) {
      return portMatch[1];
    }
    const exposeMatch = content.match(/EXPOSE (\d+)/);
    if (exposeMatch) {
      return exposeMatch[1];
    }
  }

  // Пробуем получить из docker:run команды в package.json
  const packageJsonPath = path.join(appDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (packageJson.scripts && packageJson.scripts['docker:run']) {
      const portMatch = packageJson.scripts['docker:run'].match(/-p (\d+):(\d+)/);
      if (portMatch) {
        return portMatch[1];
      }
    }
  }

  return '3000'; // По умолчанию
}

/**
 * Определяет тип приложения (nodejs/nestjs/vite)
 */
function getAppType(appName) {
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
}

/**
 * Создает конфигурацию сервиса для docker-compose
 */
function createServiceConfig(appName, port, appType) {
  // По умолчанию используем Dockerfile (production)
  const dockerfilePath = `apps/${appName}/Dockerfile`;
  const contextPath = '.';
  
  const service = {
    build: {
      context: contextPath,
      dockerfile: dockerfilePath
    },
    container_name: appName,
    ports: [`${port}:${port}`],
    environment: [
      `PORT=${port}`,
      'NODE_ENV=production'
    ],
    restart: 'unless-stopped'
  };

  // Для Vite приложений порт всегда 80
  if (appType === 'vite') {
    service.ports = [`${port}:80`];
    delete service.environment; // Vite не использует PORT env
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
  const availableApps = getAvailableApps();
  
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
    const port = getAppPort(app);
    const type = getAppType(app);
    console.log(`  ${index + 1}. ${app} (порт: ${port}, тип: ${type})`);
  });

  // Выбор приложения
  const choice = await question(`\nВыберите приложение для добавления [1-${appsToAdd.length}]: `);
  const appIndex = parseInt(choice) - 1;

  if (appIndex < 0 || appIndex >= appsToAdd.length) {
    console.error(`❌ Неверный выбор. Введите число от 1 до ${appsToAdd.length}`);
    rl.close();
    process.exit(1);
  }

  const appName = appsToAdd[appIndex];
  const port = getAppPort(appName);
  const appType = getAppType(appName);

  console.log(`\n📦 Добавляю приложение "${appName}" (порт: ${port}, тип: ${appType})...`);

  // Создаем конфигурацию сервиса для production
  const serviceConfig = createServiceConfig(appName, port, appType);
  compose.services[appName] = serviceConfig;

  // Сохраняем production docker-compose.yml
  const yamlContent = stringifyYaml(compose);
  fs.writeFileSync(composePath, yamlContent);

  // Создаем/обновляем dev версию с Dockerfile.dev
  const composeDevPath = path.join(process.cwd(), 'docker-compose.dev.yml');
  
  // Всегда создаем dev файл на основе production (синхронизация)
  const composeDev = JSON.parse(JSON.stringify(compose));
  
  // Синхронизируем другие секции
  if (compose.networks) composeDev.networks = compose.networks;
  if (compose.volumes) composeDev.volumes = compose.volumes;
  
  // Обновляем все сервисы для использования Dockerfile.dev и добавляем watch
  for (const [serviceName, service] of Object.entries(composeDev.services)) {
    if (service.build && service.build.dockerfile) {
      // Меняем Dockerfile на Dockerfile.dev
      const currentDockerfile = service.build.dockerfile;
      if (currentDockerfile.endsWith('Dockerfile') && !currentDockerfile.endsWith('Dockerfile.dev')) {
        service.build.dockerfile = currentDockerfile.replace(/Dockerfile$/, 'Dockerfile.dev');
      }
      
      // Меняем NODE_ENV на development
      if (service.environment) {
        const envIndex = service.environment.findIndex(e => typeof e === 'string' && e.startsWith('NODE_ENV='));
        if (envIndex >= 0) {
          service.environment[envIndex] = 'NODE_ENV=development';
        } else {
          service.environment.push('NODE_ENV=development');
        }
      } else {
        service.environment = ['NODE_ENV=development'];
      }
      
      // Добавляем develop.watch для dev режима
      service.develop = {
        watch: [
          {
            action: 'sync',
            path: `./apps/${serviceName}`,
            target: `/app/apps/${serviceName}`
          },
          {
            action: 'sync',
            path: `./packages`,
            target: `/app/packages`
          },
          {
            action: 'rebuild',
            path: `./.env`
          }
        ]
      };
    }
  }

  // Сохраняем dev docker-compose.dev.yml
  const yamlDevContent = stringifyYaml(composeDev);
  fs.writeFileSync(composeDevPath, yamlDevContent);

  console.log(`✅ Приложение "${appName}" добавлено в docker-compose.yml`);
  console.log(`\n📝 Файлы сохранены:`);
  console.log(`   - ${composePath} (production, использует Dockerfile)`);
  console.log(`   - ${composeDevPath} (development, использует Dockerfile.dev)`);
  console.log('\n💡 Доступные npm команды:');
  console.log('\n📦 Production:');
  console.log('   npm run docker:up              # Запустить все сервисы (фоновый режим)');
  console.log('   npm run docker:down             # Остановить все сервисы');
  console.log('   npm run docker:logs             # Просмотр логов');
  console.log('   npm run docker:build            # Пересобрать образы');
  console.log('   npm run docker:ps               # Показать статус контейнеров');
  console.log('\n🔧 Development:');
  console.log('   npm run docker:up:watch         # Запустить с watch mode + логи');
  console.log('   npm run docker:down:dev         # Остановить все сервисы');
  console.log('   npm run docker:logs:dev         # Просмотр логов');
  console.log('   npm run docker:build:dev         # Пересобрать образы');
  console.log('   npm run docker:ps:dev           # Показать статус контейнеров');
  console.log('\n💡 Прямые docker compose команды:');
  console.log(`   docker compose up -d ${appName}  # Запустить конкретный сервис (production)`);
  console.log(`   docker compose -f docker-compose.dev.yml up --watch ${appName}  # Watch mode (development)`);
  console.log(`   docker compose logs -f ${appName}  # Логи конкретного сервиса`);
  console.log('\n📝 Режимы работы:');
  console.log('   - Production: использует docker-compose.yml + Dockerfile (multi-stage build)');
  console.log('   - Development: использует docker-compose.dev.yml + Dockerfile.dev (npm run dev)');
  console.log('   - Watch mode автоматически использует development режим');
  console.log('\n🔄 Watch Mode отслеживает изменения в:');
  console.log(`   - Директории приложения (apps/${appName}/) - пересборка`);
  console.log('   - Файле окружения (.env) - пересборка');
  console.log('   - Директории packages/ - синхронизация (без пересборки)');
  console.log('\n📝 Примечание: Watch mode автоматически пересобирает и перезапускает');
  console.log('   контейнеры при изменении отслеживаемых файлов.');

  rl.close();
}

createDockerCompose().catch(err => {
  console.error('❌ Ошибка:', err.message);
  rl.close();
  process.exit(1);
});

