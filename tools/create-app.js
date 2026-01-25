#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// Импортируем генераторы
const { createNodeApp } = require('./generators/node');
const { createViteApp } = require('./generators/vite');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

const APP_TYPES = [
  { key: 'node', name: 'Node.js (express, nestjs)' },
  { key: 'vite', name: 'Vite (react, vanilla)' }
];

const NODE_VARIANTS = [
  { key: 'nestjs', name: 'NestJS API сервер' },
  { key: 'express', name: 'Express/Plain Node.js' }
];

const VITE_FRAMEWORKS = [
  { key: 'react', name: 'React + TypeScript' },
  { key: 'vanilla', name: 'Vanilla HTML + TypeScript' }
];

/**
 * Генерирует дефолтное имя приложения на основе фреймворка
 * Если приложение с таким именем уже существует, добавляет нумерацию
 */
function getDefaultAppName(frameworkName) {
  const appsDir = path.join(process.cwd(), 'apps');
  
  // Проверяем, существует ли директория apps
  if (!fs.existsSync(appsDir)) {
    return frameworkName;
  }
  
  // Проверяем, существует ли приложение с базовым именем
  const baseName = frameworkName;
  const basePath = path.join(appsDir, baseName);
  
  if (!fs.existsSync(basePath)) {
    return baseName;
  }
  
  // Если существует, ищем свободное имя с нумерацией
  let counter = 2;
  let appName = `${baseName}-${counter}`;
  let appPath = path.join(appsDir, appName);
  
  while (fs.existsSync(appPath)) {
    counter++;
    appName = `${baseName}-${counter}`;
    appPath = path.join(appsDir, appName);
  }
  
  return appName;
}

/**
 * Собирает список занятых портов из существующих приложений
 */
function getUsedPorts() {
  const usedPorts = new Set();
  const appsDir = path.join(process.cwd(), 'apps');
  
  // Проверяем .env файлы в приложениях
  if (fs.existsSync(appsDir)) {
    const apps = fs.readdirSync(appsDir, { withFileTypes: true });
    
    for (const app of apps) {
      if (app.isDirectory()) {
        const envPath = path.join(appsDir, app.name, '.env');
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf8');
          const portMatch = envContent.match(/^PORT\s*=\s*(\d+)/m);
          if (portMatch) {
            usedPorts.add(parseInt(portMatch[1]));
          }
        }
      }
    }
  }
  
  // Проверяем docker-compose.yml
  const composePath = path.join(process.cwd(), 'docker-compose.yml');
  if (fs.existsSync(composePath)) {
    try {
      const composeContent = fs.readFileSync(composePath, 'utf8');
      // Ищем паттерн портов: "3000:3000" или "3000:3000/tcp"
      const portMatches = composeContent.matchAll(/(\d+):\d+/g);
      for (const match of portMatches) {
        usedPorts.add(parseInt(match[1]));
      }
    } catch (error) {
      // Игнорируем ошибки парсинга
    }
  }
  
  return usedPorts;
}

/**
 * Находит свободный порт начиная с дефолтного
 */
function getAvailablePort(defaultPort) {
  const usedPorts = getUsedPorts();
  let port = parseInt(defaultPort);
  
  // Ищем свободный порт, начиная с дефолтного
  while (usedPorts.has(port)) {
    port++;
    // Защита от бесконечного цикла
    if (port > 65535) {
      port = parseInt(defaultPort);
      break;
    }
  }
  
  return port.toString();
}

async function createApp() {
  console.log('\n🚀 Создание нового приложения\n');

  // Выбор типа
  console.log('Выберите тип приложения:');
  APP_TYPES.forEach((type, index) => {
    console.log(`  ${index + 1}. ${type.name}`);
  });
  
  const choice = await question('\nВведите номер [по умолчанию: 1]: ') || '1';
  const typeIndex = parseInt(choice) - 1;
  
  if (typeIndex < 0 || typeIndex >= APP_TYPES.length) {
    console.error(`❌ Неверный выбор. Введите число от 1 до ${APP_TYPES.length}`);
    process.exit(1);
  }
  
  const type = APP_TYPES[typeIndex].key;

  // Дополнительные вопросы для Node.js
  let nodeVariant = 'nestjs';
  if (type === 'node') {
    console.log('\nВыберите вариант Node.js приложения:');
    NODE_VARIANTS.forEach((variant, index) => {
      console.log(`  ${index + 1}. ${variant.name}`);
    });
    
    const variantChoice = await question('\nВведите номер [по умолчанию: 1]: ') || '1';
    const variantIndex = parseInt(variantChoice) - 1;
    
    if (variantIndex < 0 || variantIndex >= NODE_VARIANTS.length) {
      console.error(`❌ Неверный выбор. Введите число от 1 до ${NODE_VARIANTS.length}`);
      process.exit(1);
    }
    
    nodeVariant = NODE_VARIANTS[variantIndex].key;
  }

  // Дополнительные вопросы для Vite
  let viteFramework = 'react';
  if (type === 'vite') {
    console.log('\nВыберите фреймворк:');
    VITE_FRAMEWORKS.forEach((fw, index) => {
      console.log(`  ${index + 1}. ${fw.name}`);
    });
    
    const fwChoice = await question('\nВведите номер [по умолчанию: 1]: ') || '1';
    const fwIndex = parseInt(fwChoice) - 1;
    
    if (fwIndex < 0 || fwIndex >= VITE_FRAMEWORKS.length) {
      console.error(`❌ Неверный выбор. Введите число от 1 до ${VITE_FRAMEWORKS.length}`);
      process.exit(1);
    }
    
    viteFramework = VITE_FRAMEWORKS[fwIndex].key;
  }

  // Определяем дефолтное имя на основе выбранного фреймворка
  let defaultName;
  if (type === 'node') {
    defaultName = getDefaultAppName(nodeVariant);
  } else if (type === 'vite') {
    defaultName = getDefaultAppName(viteFramework);
  }

  // Название
  const nameInput = await question(`\nНазвание приложения [по умолчанию: ${defaultName}]: `) || defaultName;
  const name = nameInput.trim();
  
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    console.error('❌ Название должно содержать только a-z, 0-9, -');
    process.exit(1);
  }

  // Порт
  const baseDefaultPort = type === 'vite' ? '80' : '3000';
  const defaultPort = getAvailablePort(baseDefaultPort);
  const portInput = await question(`\nПорт приложения [по умолчанию: ${defaultPort}]: `) || defaultPort;
  if (!/^\d+$/.test(portInput) || parseInt(portInput) < 1 || parseInt(portInput) > 65535) {
    console.error('❌ Порт должен быть числом от 1 до 65535');
    process.exit(1);
  }
  const port = portInput;

  const appDir = path.join(process.cwd(), 'apps', name);
  
  if (fs.existsSync(appDir)) {
    console.error(`❌ Приложение "${name}" уже существует`);
    process.exit(1);
  }

  console.log(`\n📦 Создаю приложение "${name}" типа "${type}" на порту ${port}...\n`);

  // Создаем структуру директорий
  fs.mkdirSync(path.join(appDir, 'src'), { recursive: true });

  // Вызываем соответствующий генератор
  let result;
  if (type === 'node') {
    result = createNodeApp(appDir, name, nodeVariant, port);
  } else if (type === 'vite') {
    result = createViteApp(appDir, name, viteFramework, port);
  }

  // Выводим структуру
  console.log('✅ Структура создана:');
  console.log(`   apps/${name}/`);
  result.structure.forEach(line => console.log(`   ${line}`));

  // Выводим инструкции
  console.log('\n📝 Следующие шаги:');
  console.log(`   1. pnpm install`);
  console.log(`   2. pnpm --filter ${name} dev`);
  
  if (result.nextSteps) {
    result.nextSteps.forEach(step => console.log(`   ${step}`));
  }

  console.log('\n💡 Доступные команды:');
  result.commands.forEach(cmd => console.log(`   ${cmd}`));

  if (result.envInfo) {
    console.log('\n📝 ' + result.envInfo[0]);
    result.envInfo.slice(1).forEach(info => console.log(`   ${info}`));
  }

  // Автоматически добавляем приложение в docker-compose.yml
  console.log('\n🐳 Добавляю приложение в docker-compose.yml...');
  try {
    const { addAppToDockerCompose } = require('./create-docker-compose');
    await addAppToDockerCompose(name);
    console.log('\n💡 Docker команды:');
    console.log(`   pnpm docker:up-all              # Запустить все сервисы (production)`);
    console.log(`   pnpm docker:up-all:watch      # Запустить с watch mode (development)`);
  } catch (error) {
    console.warn(`\n⚠️  Не удалось добавить приложение в docker-compose.yml: ${error.message}`);
    console.log(`   Вы можете добавить его вручную: pnpm create:docker-compose`);
  }

  // Спрашиваем об установке зависимостей
  console.log('\n📦 Установка зависимостей');
  const installDeps = await question('Установить зависимости? (y/n) [по умолчанию: y]: ') || 'y';
  
  if (installDeps.toLowerCase() === 'y' || installDeps.toLowerCase() === 'yes') {
    console.log('\n📦 Устанавливаю зависимости...');
    try {
      execSync('pnpm install', {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log('\n✅ Зависимости установлены!');
    } catch (error) {
      console.warn('\n⚠️  Не удалось автоматически установить зависимости.');
      console.log('   Выполните вручную: pnpm install');
    }
  } else {
    console.log('\n⏭️  Пропущена установка зависимостей.');
    console.log('   Выполните вручную: pnpm install');
  }

  rl.close();
}

createApp().catch(err => {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});

