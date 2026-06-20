#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { generateNodeDockerfile } = require('../generators/node-dockerfile-generator');
const { generateViteDockerfile } = require('../generators/vite-dockerfile-generator');

const APPS_DIR = path.join(process.cwd(), 'apps');

function printHelp() {
  console.log(`Использование: pnpm sync:dockerfile [app] [--all]

Перегенерирует apps/*/Dockerfile из шаблонов tools/generators.

Примеры:
  pnpm sync:dockerfile           # все Node/Vite приложения
  pnpm sync:dockerfile --all     # то же
  pnpm sync:dockerfile nestjs    # одно приложение
`);
}

function detectAppType(appDir) {
  if (fs.existsSync(path.join(appDir, 'tsdown.config.ts'))) return 'node';
  if (fs.existsSync(path.join(appDir, 'vite.config.ts'))) return 'vite';
  return null;
}

function generateDockerfile(appName, type) {
  if (type === 'node') return generateNodeDockerfile(appName);
  if (type === 'vite') return generateViteDockerfile(appName);
  throw new Error(`Неизвестный тип приложения: ${type}`);
}

function listSyncableApps() {
  if (!fs.existsSync(APPS_DIR)) return [];

  return fs
    .readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => detectAppType(path.join(APPS_DIR, name)));
}

function syncAppDockerfile(appName) {
  const appDir = path.join(APPS_DIR, appName);

  if (!fs.existsSync(appDir)) {
    throw new Error(`Приложение не найдено: apps/${appName}`);
  }

  const type = detectAppType(appDir);
  if (!type) {
    throw new Error(
      `Не удалось определить тип apps/${appName} (нужен tsdown.config.ts или vite.config.ts)`,
    );
  }

  const dockerfilePath = path.join(appDir, 'Dockerfile');
  const content = generateDockerfile(appName, type);
  const existing = fs.existsSync(dockerfilePath)
    ? fs.readFileSync(dockerfilePath, 'utf8')
    : null;

  if (existing === content) {
    return { appName, type, changed: false };
  }

  fs.writeFileSync(dockerfilePath, content);
  return { appName, type, changed: true };
}

function parseArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const all = argv.includes('--all');
  const apps = argv.filter((arg) => !arg.startsWith('-'));

  return { all, apps };
}

function main() {
  const { all, apps } = parseArgs(process.argv.slice(2));
  const targets = apps.length > 0 ? apps : all || apps.length === 0 ? listSyncableApps() : apps;

  if (targets.length === 0) {
    console.error('❌ Нет приложений для синхронизации (apps/* с tsdown.config.ts или vite.config.ts)');
    process.exit(1);
  }

  let updated = 0;

  for (const appName of targets) {
    const result = syncAppDockerfile(appName);
    if (result.changed) {
      updated += 1;
      console.log(`✅ apps/${appName}/Dockerfile (${result.type})`);
    } else {
      console.log(`⏭️  apps/${appName}/Dockerfile — без изменений`);
    }
  }

  console.log(`\nГотово: ${updated}/${targets.length} обновлено`);
}

try {
  main();
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}
