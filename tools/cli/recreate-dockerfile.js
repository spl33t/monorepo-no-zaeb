#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { generateNodeDockerfile } = require('../generators/node-dockerfile-generator');
const { generateViteDockerfile } = require('../generators/vite-dockerfile-generator');

const APPS_DIR = path.join(process.cwd(), 'apps');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

function printHelp() {
  console.log(`Использование: pnpm recreate:dockerfile [app...] [--all]

Перегенерирует apps/*/Dockerfile из шаблонов tools/generators.

Без аргументов — интерактивный выбор (all или номера через пробел).

Примеры:
  pnpm recreate:dockerfile
  pnpm recreate:dockerfile --all
  pnpm recreate:dockerfile nestjs
`);
}

function detectAppType(appDir) {
  if (fs.existsSync(path.join(appDir, 'vite.config.ts'))) return 'vite';

  const pkgPath = path.join(appDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (typeof pkg.scripts?.build === 'string' && pkg.scripts.build.includes('node-run')) {
      return 'node';
    }
  }

  return null;
}

function generateDockerfile(appName, type) {
  if (type === 'node') return generateNodeDockerfile(appName);
  if (type === 'vite') return generateViteDockerfile(appName);
  throw new Error(`Неизвестный тип приложения: ${type}`);
}

function listRecreatableApps() {
  if (!fs.existsSync(APPS_DIR)) return [];

  return fs
    .readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const appDir = path.join(APPS_DIR, entry.name);
      const type = detectAppType(appDir);
      return type ? { name: entry.name, type } : null;
    })
    .filter(Boolean);
}

function recreateAppDockerfile(appName) {
  const appDir = path.join(APPS_DIR, appName);

  if (!fs.existsSync(appDir)) {
    throw new Error(`Приложение не найдено: apps/${appName}`);
  }

  const type = detectAppType(appDir);
  if (!type) {
    throw new Error(
      `Не удалось определить тип apps/${appName} (нужен node-run в scripts.build или vite.config.ts)`,
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

function appsFromSelection(input, apps) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    console.error('❌ Укажите all или номера приложений через пробел');
    process.exit(1);
  }

  if (trimmed === 'all') {
    return apps.map((app) => app.name);
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const selected = [];

  for (const part of parts) {
    const index = Number(part);
    if (Number.isInteger(index) && index >= 1 && index <= apps.length) {
      selected.push(apps[index - 1].name);
      continue;
    }

    const byName = apps.find((app) => app.name === part);
    if (byName) {
      selected.push(byName.name);
      continue;
    }

    console.error(`❌ Некорректный выбор: ${part}`);
    process.exit(1);
  }

  return [...new Set(selected)];
}

async function askTargets(apps) {
  console.log('\n🐳 Пересоздать Dockerfile\n');
  console.log('Приложения:');
  apps.forEach((app, index) => {
    console.log(`  ${index + 1}) ${app.name} (${app.type})`);
  });
  console.log('');

  const answer = await question('Выбор (all или номера через пробел): ');
  return appsFromSelection(answer, apps);
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

function runRecreate(targets) {
  if (targets.length === 0) {
    console.error('❌ Нет приложений для обновления (apps/* с node-run или vite.config.ts)');
    process.exit(1);
  }

  let updated = 0;

  for (const appName of targets) {
    const result = recreateAppDockerfile(appName);
    if (result.changed) {
      updated += 1;
      console.log(`✅ apps/${appName}/Dockerfile (${result.type})`);
    } else {
      console.log(`⏭️  apps/${appName}/Dockerfile — без изменений`);
    }
  }

  console.log(`\nГотово: ${updated}/${targets.length} обновлено`);
}

async function main() {
  const { all, apps } = parseArgs(process.argv.slice(2));
  const recreatable = listRecreatableApps();

  if (recreatable.length === 0) {
    console.error('❌ Нет приложений для обновления (apps/* с node-run или vite.config.ts)');
    process.exit(1);
  }

  let targets;

  if (apps.length > 0) {
    targets = apps;
  } else if (all) {
    targets = recreatable.map((app) => app.name);
  } else {
    targets = await askTargets(recreatable);
    rl.close();
  }

  runRecreate(targets);
}

main().catch((error) => {
  rl.close();
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
