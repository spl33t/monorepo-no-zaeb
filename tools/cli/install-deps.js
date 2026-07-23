#!/usr/bin/env node
'use strict';

/**
 * Установка deps монорепы — без обязательных флагов.
 *
 * Что ставить: только корни, у которых уже есть package.json в дереве
 *   (локально — все три; в Docker — те, что COPY до RUN).
 * Как ставить:
 *   /.dockerenv или CI=true     → npm ci
 *   иначе                       → npm install
 *   NODE_ENV=production         → --omit=dev (все выбранные корни)
 *
 * Локально:  npm run deps:install
 * Docker:    COPY нужные package.json → RUN node tools/cli/install-deps.js
 *            (в production stage: ENV NODE_ENV=production перед RUN)
 *
 * Override (редко): MONOREPO_DEPS_CI=0|1, MONOREPO_DEPS_OMIT_DEV=0|1
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const monorepoRoot = path.resolve(__dirname, '../..');

/** @type {ReadonlyArray<{ id: string, label: string, rel: string }>} */
const ROOTS = [
  { id: 'root', label: 'root (tools + isomorphic)', rel: '.' },
  { id: 'nestjs', label: 'nestjs-apps', rel: 'nestjs-apps' },
  { id: 'vite', label: 'vite-apps', rel: 'vite-apps' },
];

function inDocker() {
  return fs.existsSync('/.dockerenv');
}

function envFlag(name) {
  const v = process.env[name];
  if (v === undefined || v === '') return null;
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return null;
}

function resolveMode() {
  const ciOverride = envFlag('MONOREPO_DEPS_CI');
  const omitOverride = envFlag('MONOREPO_DEPS_OMIT_DEV');

  const ci =
    ciOverride !== null
      ? ciOverride
      : inDocker() || process.env.CI === 'true' || process.env.CI === '1';

  const omitDev =
    omitOverride !== null
      ? omitOverride
      : process.env.NODE_ENV === 'production';

  return { ci, omitDev };
}

function discoverRoots() {
  return ROOTS.filter((r) =>
    fs.existsSync(path.join(monorepoRoot, r.rel, 'package.json')),
  );
}

function npmCmd({ ci, omitDev }) {
  let cmd = ci ? 'npm ci' : 'npm install';
  if (omitDev) cmd += ' --omit=dev';
  return cmd;
}

function printHelp() {
  console.log(`Usage: node tools/cli/install-deps.js

  Без флагов. Авто:
    • корни = где есть package.json (root / nestjs-apps / vite-apps)
    • Docker или CI=true → npm ci, иначе npm install
    • NODE_ENV=production → --omit=dev

  Override: MONOREPO_DEPS_CI=0|1  MONOREPO_DEPS_OMIT_DEV=0|1
`);
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const mode = resolveMode();
  const targets = discoverRoots();
  const cmd = npmCmd(mode);

  if (targets.length === 0) {
    throw new Error('No monorepo roots with package.json found');
  }

  console.log('\ndeps:install — авто\n');
  console.log(`  detect: docker=${inDocker()} CI=${process.env.CI || '—'} NODE_ENV=${process.env.NODE_ENV || '—'}`);
  console.log(`  mode: ${cmd}`);
  console.log(`  roots: ${targets.map((t) => t.id).join(', ')}`);
  console.log('');

  for (const t of targets) {
    const cwd = path.join(monorepoRoot, t.rel);
    console.log('────────────────────────────────────────');
    console.log(`📦 ${t.label}`);
    console.log(`   cwd: ${path.relative(monorepoRoot, cwd) || '.'}`);
    console.log(`   cmd: ${cmd}`);
    console.log('────────────────────────────────────────\n');
    execSync(cmd, { cwd, stdio: 'inherit' });
    console.log(`\n✅ ${t.id}\n`);
  }

  console.log('────────────────────────────────────────');
  console.log('✅ deps:install — готово');
  console.log('────────────────────────────────────────\n');
}

main();
