#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Импортируем генераторы
const { createNodeJsApp } = require('./generators/nodejs');
const { createNestJsApp } = require('./generators/nestjs');
const { createViteApp } = require('./generators/vite');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

const APP_TYPES = [
  { key: 'nodejs', name: 'Node.js TypeScript приложение' },
  { key: 'nestjs', name: 'NestJS API сервер' },
  { key: 'vite', name: 'Vite приложение (React/Vanilla)' }
];

const VITE_FRAMEWORKS = [
  { key: 'react', name: 'React + TypeScript' },
  { key: 'vanilla', name: 'Vanilla HTML + TypeScript' }
];

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

  // Название
  const name = await question('\nНазвание приложения: ');
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    console.error('❌ Название должно содержать только a-z, 0-9, -');
    process.exit(1);
  }

  // Порт (только для Node.js/NestJS, для Vite всегда 80)
  let port = '80';
  if (type !== 'vite') {
    const defaultPort = type === 'nestjs' ? '3000' : '3000';
    const portInput = await question(`\nПорт приложения [по умолчанию: ${defaultPort}]: `) || defaultPort;
    if (!/^\d+$/.test(portInput) || parseInt(portInput) < 1 || parseInt(portInput) > 65535) {
      console.error('❌ Порт должен быть числом от 1 до 65535');
      process.exit(1);
    }
    port = portInput;
  }

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
  if (type === 'nodejs') {
    result = createNodeJsApp(appDir, name, port);
  } else if (type === 'nestjs') {
    result = createNestJsApp(appDir, name, port);
  } else if (type === 'vite') {
    result = createViteApp(appDir, name, viteFramework);
  }

  // Выводим структуру
  console.log('✅ Структура создана:');
  console.log(`   apps/${name}/`);
  result.structure.forEach(line => console.log(`   ${line}`));

  // Выводим инструкции
  console.log('\n📝 Следующие шаги:');
  console.log(`   1. npm install`);
  console.log(`   2. npm run dev --workspace=${name}`);
  
  if (result.nextSteps) {
    result.nextSteps.forEach(step => console.log(`   ${step}`));
  }

  console.log('\n💡 Доступные команды:');
  result.commands.forEach(cmd => console.log(`   ${cmd}`));

  if (result.dockerCommands) {
    console.log('\n🐳 Docker команды:');
    result.dockerCommands.forEach(cmd => console.log(`   ${cmd}`));
  }

  if (result.envInfo) {
    console.log('\n📝 ' + result.envInfo[0]);
    result.envInfo.slice(1).forEach(info => console.log(`   ${info}`));
  }

  rl.close();
}

createApp().catch(err => {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});

