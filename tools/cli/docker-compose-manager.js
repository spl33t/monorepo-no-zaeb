#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, execSync } = require('child_process');
const { parseDockerCompose } = require('../lib/docker-compose-parser');
const { findMonorepoRoot } = require('../lib/monorepo-layout');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

/**
 * Получает статус контейнеров через docker compose ps
 * @param {string[]} serviceNames
 * @param {string} monorepoRoot
 */
function getContainerStatuses(serviceNames, monorepoRoot) {
  const statusMap = {};

  try {
    // Получаем статус контейнеров в JSON формате
    const output = execSync('docker compose ps --format json', {
      encoding: 'utf8',
      cwd: monorepoRoot,
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000
    });

    // Парсим JSON строки (каждая строка - отдельный JSON объект)
    const lines = output.trim().split('\n').filter(line => line.trim());

    lines.forEach(line => {
      try {
        const container = JSON.parse(line);
        // Пробуем разные поля для имени сервиса
        const serviceName = container.Service || container.service || container.Name || container.name;
        const state = container.State || container.state || container.Status || container.status;

        if (serviceName && state) {
          statusMap[serviceName] = state;
        }
      } catch (e) {
        // Игнорируем ошибки парсинга отдельных строк
      }
    });
  } catch (error) {
    // Если команда не выполнилась (например, контейнеры не запущены), возвращаем пустой объект
    // Это нормально, значит все сервисы остановлены
  }

  // Также проверяем через docker ps для более точного сопоставления
  try {
    const psOutput = execSync('docker ps -a --format "{{.Names}}\t{{.Status}}"', {
      encoding: 'utf8',
      cwd: monorepoRoot,
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000
    });

    const psLines = psOutput.trim().split('\n').filter(line => line.trim());

    psLines.forEach(line => {
      const [containerName, ...statusParts] = line.split('\t');
      const status = statusParts.join(' ');

      // Сопоставляем имя контейнера с именем сервиса
      // В docker-compose имя контейнера обычно совпадает с именем сервиса
      // или имеет формат: <project>_<service>_<number>
      serviceNames.forEach(serviceName => {
        if (containerName === serviceName ||
            containerName.startsWith(serviceName + '_') ||
            containerName.endsWith('_' + serviceName)) {
          // Извлекаем состояние из статуса (например, "Up 5 minutes" -> "running")
          if (status.toLowerCase().includes('up')) {
            statusMap[serviceName] = 'running';
          } else if (status.toLowerCase().includes('exited')) {
            statusMap[serviceName] = 'exited';
          } else if (!statusMap[serviceName]) {
            statusMap[serviceName] = status;
          }
        }
      });
    });
  } catch (error) {
    // Игнорируем ошибки
  }

  return statusMap;
}

/**
 * Форматирует статус для отображения
 */
function formatStatus(status) {
  if (!status || status === 'unknown') {
    return '○ остановлен';
  }

  const statusLower = status.toLowerCase();

  if (statusLower.includes('running') || statusLower === 'up') {
    return '✓ запущен';
  } else if (statusLower.includes('exited') || statusLower === 'stopped') {
    return '✗ остановлен';
  } else if (statusLower.includes('restarting')) {
    return '↻ перезапуск';
  } else if (statusLower.includes('paused')) {
    return '⏸ приостановлен';
  } else if (statusLower.includes('dead')) {
    return '✕ мертв';
  } else {
    return `○ ${status}`;
  }
}

/**
 * Извлекает порты из конфигурации сервиса
 */
function getServicePorts(serviceConfig) {
  if (!serviceConfig || !serviceConfig.ports) {
    return '-';
  }

  const ports = serviceConfig.ports;
  const portStrings = [];

  if (Array.isArray(ports)) {
    ports.forEach(port => {
      if (typeof port === 'string') {
        // Формат "host:container" или "host:container/protocol"
        const portPart = port.split('/')[0];
        const hostPort = portPart.split(':')[0];
        portStrings.push(hostPort);
      } else if (typeof port === 'object' && port.published) {
        // Формат объекта { published: 4444, target: 4444 }
        portStrings.push(port.published.toString());
      }
    });
  }

  return portStrings.length > 0 ? portStrings.join(', ') : '-';
}

/**
 * Выводит таблицу сервисов
 */
function displayServicesTable(services, statuses = {}) {
  const serviceNames = Object.keys(services);

  if (serviceNames.length === 0) {
    console.log('❌ Сервисы не найдены в docker-compose.yml');
    return;
  }

  console.log('\n📋 Доступные сервисы:\n');
  console.log('┌─────┬─────────────────────────────────────┬──────────────────┬──────────────┐');
  console.log('│ №   │ Название сервиса                    │ Статус           │ Порты        │');
  console.log('├─────┼─────────────────────────────────────┼──────────────────┼──────────────┤');

  serviceNames.forEach((name, index) => {
    const num = (index + 1).toString().padEnd(3);
    const serviceName = name.padEnd(35);
    const status = formatStatus(statuses[name] || 'unknown');
    const statusPadded = status.padEnd(16);
    const ports = getServicePorts(services[name]);
    const portsPadded = ports.padEnd(12);
    console.log(`│ ${num} │ ${serviceName} │ ${statusPadded} │ ${portsPadded} │`);
  });

  console.log('└─────┴─────────────────────────────────────┴──────────────────┴──────────────┘');
  console.log(`\nВсего сервисов: ${serviceNames.length}`);
}

/**
 * Парсит ввод номеров сервисов
 */
function parseServiceNumbers(input, totalServices) {
  if (!input || input.trim() === '') {
    // Пустой ввод - все сервисы
    return Array.from({ length: totalServices }, (_, i) => i + 1);
  }

  const numbers = input
    .trim()
    .split(/\s+/)
    .map(num => parseInt(num))
    .filter(num => !isNaN(num) && num > 0 && num <= totalServices);

  return numbers;
}

/**
 * Запускает docker compose команду
 * @param {string[]} serviceNames
 * @param {string} target
 * @param {string} monorepoRoot
 */
function runDockerCompose(serviceNames, target, monorepoRoot) {
  const args = ['compose', 'up', '--build'];

  // Для development добавляем флаг --watch
  if (target === 'development') {
    args.push('--watch');
  }

  // Добавляем имена сервисов если они указаны
  if (serviceNames.length > 0) {
    args.push(...serviceNames);
  }

  console.log('\n🚀 Запускаю команду:');
  const watchFlag = target === 'development' ? '--watch ' : '';
  const command = `cross-env DOCKER_TARGET=${target} docker compose up --build ${watchFlag}${serviceNames.length > 0 ? serviceNames.join(' ') : ''}`.trim();
  console.log(`   ${command}\n`);

  // Используем cross-env для Windows совместимости
  const child = spawn('cross-env', [
    `DOCKER_TARGET=${target}`,
    'docker',
    ...args
  ], {
    stdio: 'inherit',
    shell: true,
    cwd: monorepoRoot,
  });

  child.on('error', (error) => {
    console.error(`\n❌ Ошибка при запуске команды: ${error.message}`);
    rl.close();
    process.exit(1);
  });

  child.on('exit', (code) => {
    rl.close();
    process.exit(code || 0);
  });
}

/**
 * Главная функция
 */
async function manageDockerCompose() {
  console.log('\n🐳 Docker Compose Manager\n');

  let monorepoRoot;
  try {
    monorepoRoot = findMonorepoRoot();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    rl.close();
    process.exit(1);
  }

  const composePath = path.join(monorepoRoot, 'docker-compose.yml');

  if (!fs.existsSync(composePath)) {
    console.error(`❌ Файл docker-compose.yml не найден в ${monorepoRoot}`);
    console.log('💡 Создайте docker-compose.yml или запустите: npm run docker:create-compose');
    rl.close();
    process.exit(1);
  }

  // Парсим docker-compose.yml
  let compose;
  try {
    compose = parseDockerCompose(composePath);
  } catch (error) {
    console.error(`❌ Ошибка при парсинге docker-compose.yml: ${error.message}`);
    rl.close();
    process.exit(1);
  }

  const services = compose.services || {};
  const serviceNames = Object.keys(services);

  if (serviceNames.length === 0) {
    console.error('❌ В docker-compose.yml не найдено сервисов');
    rl.close();
    process.exit(1);
  }

  // Получаем статусы контейнеров
  console.log('🔍 Проверяю статус контейнеров...');
  const statuses = getContainerStatuses(serviceNames, monorepoRoot);

  // Выводим таблицу сервисов
  displayServicesTable(services, statuses);

  // Запрашиваем выбор сервисов
  console.log('\n💡 Введите номера сервисов через пробел (например: 1 3 5)');
  console.log('   Или оставьте пустым для запуска всех сервисов');
  const servicesInput = await question('\nВыберите сервисы: ');

  const selectedNumbers = parseServiceNumbers(servicesInput, serviceNames.length);

  if (selectedNumbers.length === 0) {
    console.error('❌ Не выбрано ни одного сервиса');
    rl.close();
    process.exit(1);
  }

  // Получаем имена выбранных сервисов
  const selectedServices = selectedNumbers.map(num => serviceNames[num - 1]);

  console.log('\n✅ Выбраны сервисы:');
  selectedServices.forEach((name, index) => {
    console.log(`   ${index + 1}. ${name}`);
  });

  // Запрашиваем target (dev/prod)
  console.log('\n🎯 Выберите target:');
  console.log('   1. development (dev)');
  console.log('   2. production (prod)');

  const targetChoice = await question('\nВведите номер [по умолчанию: 1]: ') || '1';

  let target;
  if (targetChoice === '2' || targetChoice.toLowerCase() === 'prod' || targetChoice.toLowerCase() === 'production') {
    target = 'production';
  } else {
    target = 'development';
  }

  console.log(`\n📌 Target: ${target}`);

  // Запускаем команду
  runDockerCompose(selectedServices, target, monorepoRoot);
}

// Запуск
if (require.main === module) {
  manageDockerCompose().catch(err => {
    console.error('❌ Ошибка:', err.message);
    rl.close();
    process.exit(1);
  });
}

