#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { rimrafSync } = require('rimraf');

const SKIP_DIRS = new Set(['.git', 'dist', '.turbo', '.next', 'coverage']);

function printHelp() {
  console.log(`Использование: pnpm deps:reinstall

Удаляет все node_modules в монорепозитории и выполняет pnpm install с корня.

Пример:
  pnpm deps:reinstall
`);
}

function findNodeModulesDirs(root) {
  const dirs = [];

  function walk(dir) {
    let entries;

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.name === 'node_modules') {
        dirs.push(fullPath);
        continue;
      }

      if (SKIP_DIRS.has(entry.name)) continue;

      walk(fullPath);
    }
  }

  walk(root);
  return dirs.sort((a, b) => b.length - a.length);
}

function removeNodeModules(root) {
  const dirs = findNodeModulesDirs(root);

  if (dirs.length === 0) {
    console.log('ℹ️  node_modules не найдены');
    return 0;
  }

  console.log(`🧹 Удаление ${dirs.length} node_modules...\n`);

  for (const dir of dirs) {
    const rel = path.relative(root, dir) || 'node_modules';
    process.stdout.write(`  ${rel}\n`);
    rimrafSync(dir);
  }

  console.log('');
  return dirs.length;
}

function installDeps(root) {
  console.log('📦 pnpm install...\n');
  execSync('pnpm install', { cwd: root, stdio: 'inherit' });
}

function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  if (argv.length > 0) {
    console.error(`❌ Неизвестные аргументы: ${argv.join(' ')}`);
    printHelp();
    process.exit(1);
  }

  const root = process.cwd();

  try {
    removeNodeModules(root);
    installDeps(root);
    console.log('\n✅ Зависимости переустановлены');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ ${message}`);
    process.exit(1);
  }
}

main();
