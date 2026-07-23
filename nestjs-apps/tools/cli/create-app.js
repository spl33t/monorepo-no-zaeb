#!/usr/bin/env node

const path = require('path');
const { runCreateApp } = require('../../../tools/lib/create-app-shell');
const { createNestApp } = require('../generators/create-app');

const toolchainRoot = path.resolve(__dirname, '../..');

runCreateApp({
  world: 'nestjs',
  toolchainRoot,
  defaultPort: '3000',
  defaultKind: 'nestjs',
  title: 'NestJS приложение (nestjs-apps)',
  frameworks: [
    { key: 'nestjs', name: 'Классический NestJS (nest CLI)' },
    { key: 'nestia', name: 'Nestia + typia (сборка через ttsc)' },
  ],
  kindAliases: {
    nestjs: 'nestjs',
    nest: 'nestjs',
    classic: 'nestjs',
    nestia: 'nestia',
  },
  helpText: `
NestJS app → nestjs-apps/apps/<name>

Интерактивно:
  cd nestjs-apps && npm run create:app

Одна команда:
  npm run create:app -- --kind nestjs --name api [--port 3000] [--no-install]
  npm run create:app -- --kind nestia --name api

Флаги:
  --kind / --variant   nestjs | nestia (или nest | classic)
  --name               a-z, 0-9, дефис
  --port               1–65535
  --no-install
`,
  generate: ({ appDir, name, port, kind }) =>
    createNestApp(appDir, name, kind || 'nestjs', port),
}).catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
