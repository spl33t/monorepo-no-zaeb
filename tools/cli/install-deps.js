#!/usr/bin/env node
'use strict';

const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '../..');

const targets = [
  { label: 'root (tools)', cwd: root },
  { label: 'nestjs-apps', cwd: path.join(root, 'nestjs-apps') },
  { label: 'vite-apps', cwd: path.join(root, 'vite-apps') },
];

console.log('\ndeps:install — три независимых npm install (без общего workspace)\n');

for (const { label, cwd } of targets) {
  console.log('────────────────────────────────────────');
  console.log(`📦 Сейчас: ${label}`);
  console.log(`   cwd: ${path.relative(root, cwd) || '.'}`);
  console.log('────────────────────────────────────────\n');
  execSync('npm install', { cwd, stdio: 'inherit' });
  console.log(`\n✅ Готово: ${label}\n`);
}

console.log('────────────────────────────────────────');
console.log('✅ deps:install — все корни установлены');
console.log('────────────────────────────────────────\n');
