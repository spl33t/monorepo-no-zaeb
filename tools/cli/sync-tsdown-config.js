#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { generateTsdownConfig } = require('../generators/tsdown-config');
const { resolveMonorepoDistPaths } = require('../lib/monorepo-dist.ts');

const APPS_DIR = path.join(process.cwd(), 'apps');

function printHelp() {
  console.log(`Использование: pnpm sync:tsdown [app] [--all]

Перегенерирует apps/*/tsdown.config.ts из шаблона tools/generators/tsdown-config.js.
Entry определяется из текущего конфига или src/main.ts / src/index.ts.

Примеры:
  pnpm sync:tsdown           # все Node-приложения с tsdown
  pnpm sync:tsdown --all     # то же
  pnpm sync:tsdown nestjs    # одно приложение
`);
}

function detectTsdownEntryPath(appDir) {
  const configPath = path.join(appDir, 'tsdown.config.ts');

  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/resolveMonorepoDistPaths\(\s*['"]([^'"]+)['"]\s*\)/);
    if (match) return match[1];
  }

  if (fs.existsSync(path.join(appDir, 'src/main.ts'))) return 'src/main.ts';
  if (fs.existsSync(path.join(appDir, 'src/index.ts'))) return 'src/index.ts';

  throw new Error('Не удалось определить entry (ожидается src/main.ts или src/index.ts)');
}

function listSyncableApps() {
  if (!fs.existsSync(APPS_DIR)) return [];

  return fs
    .readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(APPS_DIR, name, 'tsdown.config.ts')));
}

function syncPackageMain(appDir, entryPath) {
  const packageJsonPath = path.join(appDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return false;

  const distPaths = resolveMonorepoDistPaths(entryPath, appDir);
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (pkg.main === distPaths.main) return false;

  pkg.main = distPaths.main;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return true;
}

function syncAppTsdownConfig(appName) {
  const appDir = path.join(APPS_DIR, appName);

  if (!fs.existsSync(appDir)) {
    throw new Error(`Приложение не найдено: apps/${appName}`);
  }

  const entryPath = detectTsdownEntryPath(appDir);
  const configPath = path.join(appDir, 'tsdown.config.ts');
  const content = generateTsdownConfig(entryPath, appDir);
  const existing = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, 'utf8')
    : null;

  const configChanged = existing !== content;
  if (configChanged) {
    fs.writeFileSync(configPath, content);
  }

  const mainChanged = syncPackageMain(appDir, entryPath);

  return { appName, entryPath, configChanged, mainChanged };
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
    console.error('❌ Нет приложений для синхронизации (apps/* с tsdown.config.ts)');
    process.exit(1);
  }

  let updated = 0;

  for (const appName of targets) {
    const result = syncAppTsdownConfig(appName);

    if (result.configChanged || result.mainChanged) {
      updated += 1;
      const parts = [];
      if (result.configChanged) parts.push('tsdown.config.ts');
      if (result.mainChanged) parts.push('package.json#main');
      console.log(`✅ apps/${appName} (${result.entryPath}) — ${parts.join(', ')}`);
    } else {
      console.log(`⏭️  apps/${appName}/tsdown.config.ts — без изменений`);
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
