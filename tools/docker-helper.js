#!/usr/bin/env node

const { execSync } = require('child_process');
const { platform } = require('os');
const path = require('path');
const fs = require('fs');

const isWindows = platform() === 'win32';

// Находим корень монорепо (где есть package.json с workspaces)
function findMonorepoRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;
  
  while (current !== root) {
    const packageJsonPath = path.join(current, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.workspaces) {
          return current;
        }
      } catch (e) {
        // Продолжаем поиск
      }
    }
    current = path.dirname(current);
  }
  
  return startDir; // Если не нашли, возвращаем текущую директорию
}

function exec(command, options = {}) {
  try {
    execSync(command, { stdio: 'inherit', ...options });
  } catch (error) {
    // Игнорируем ошибки для команд, которые могут не найти контейнер
    if (!options.ignoreErrors) {
      process.exit(error.status || 1);
    }
  }
}

const [action, ...args] = process.argv.slice(2);

if (action === 'rm-if-exists') {
  const containerName = args[0];
  // Пытаемся удалить контейнер, игнорируем ошибки если его нет
  exec(`docker rm -f ${containerName}`, { ignoreErrors: true });
} else if (action === 'stop-if-exists') {
  const containerName = args[0];
  // Пытаемся остановить контейнер, игнорируем ошибки если его нет
  exec(`docker stop ${containerName}`, { ignoreErrors: true });
  exec(`docker rm -f ${containerName}`, { ignoreErrors: true });
} else if (action === 'build') {
  const dockerfilePath = args[0]; // Dockerfile (относительно папки приложения)
  const name = args[1]; // Имя образа
  
  // Текущая директория (откуда запущена команда - обычно apps/backend/)
  const currentDir = process.cwd();
  
  // Находим корень монорепо
  const monorepoRoot = findMonorepoRoot(currentDir);
  
  // Путь к Dockerfile относительно текущей директории
  const dockerfileFromCurrent = path.resolve(currentDir, dockerfilePath);
  
  // Проверяем, что Dockerfile существует
  if (!fs.existsSync(dockerfileFromCurrent)) {
    console.error(`❌ Dockerfile not found: ${dockerfileFromCurrent}`);
    process.exit(1);
  }
  
  // Путь к Dockerfile относительно корня монорепо
  const dockerfileRelative = path.relative(monorepoRoot, dockerfileFromCurrent);
  
  const originalCwd = process.cwd();
  
  try {
    // Переходим в корень монорепо
    process.chdir(monorepoRoot);
    
    // Собираем образ из корня монорепо
    exec(`docker build -f ${dockerfileRelative} -t ${name} .`);
  } finally {
    // Возвращаемся в исходную директорию
    process.chdir(originalCwd);
  }
} else if (action === 'run') {
  const detached = args[0] === '-d';
  const port = args[1];
  const name = args[2];
  const image = args[3];
  const cmd = detached 
    ? `docker run -d -p ${port}:${port} --name ${name} ${image}`
    : `docker run -p ${port}:${port} --name ${name} ${image}`;
  exec(cmd);
} else if (action === 'up') {
  const dockerfilePath = args[0]; // Dockerfile (относительно папки приложения)
  const name = args[1]; // Имя используется и для образа, и для контейнера
  const port = args[2];
  const detached = args[3] === '-d';
  
  // Текущая директория (откуда запущена команда - обычно apps/backend/)
  const currentDir = process.cwd();
  
  // Находим корень монорепо
  const monorepoRoot = findMonorepoRoot(currentDir);
  
  // Путь к Dockerfile относительно текущей директории
  const dockerfileFromCurrent = path.resolve(currentDir, dockerfilePath);
  
  // Проверяем, что Dockerfile существует
  if (!fs.existsSync(dockerfileFromCurrent)) {
    console.error(`❌ Dockerfile not found: ${dockerfileFromCurrent}`);
    process.exit(1);
  }
  
  // Путь к Dockerfile относительно корня монорепо
  const dockerfileRelative = path.relative(monorepoRoot, dockerfileFromCurrent);
  
  const originalCwd = process.cwd();
  
  try {
    // Переходим в корень монорепо
    process.chdir(monorepoRoot);
    
    // Удаляем старый контейнер если есть
    exec(`docker rm -f ${name}`, { ignoreErrors: true });
    // Собираем образ из корня монорепо
    exec(`docker build -f ${dockerfileRelative} -t ${name} .`);
    // Запускаем контейнер
    const runCmd = detached 
      ? `docker run -d -p ${port}:${port} --name ${name} ${name}`
      : `docker run -p ${port}:${port} --name ${name} ${name}`;
    exec(runCmd);
  } finally {
    // Возвращаемся в исходную директорию
    process.chdir(originalCwd);
  }
} else if (action === 'down') {
  const name = args[0];
  exec(`docker stop ${name}`, { ignoreErrors: true });
  exec(`docker rm -f ${name}`, { ignoreErrors: true });
} else {
  console.error(`Unknown action: ${action}`);
  process.exit(1);
}

