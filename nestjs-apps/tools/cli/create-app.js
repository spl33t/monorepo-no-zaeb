#!/usr/bin/env node

const path = require('path');
const { runCreateApp } = require('../../../tools/lib/create-app-shell');
const { createNestApp } = require('../generators/create-app');

const toolchainRoot = path.resolve(__dirname, '../..');

runCreateApp({
  world: 'nestjs',
  toolchainRoot,
  defaultPort: '3000',
  title: 'NestJS приложение (nestjs-apps)',
  helpText: `
NestJS app → nestjs-apps/apps/<name>

Интерактивно:
  cd nestjs-apps && npm run create:app

Одна команда:
  npm run create:app -- --name api [--port 3000] [--no-install]

Флаги:
  --name         a-z, 0-9, дефис
  --port         1–65535
  --no-install
`,
  generate: ({ appDir, name, port }) => createNestApp(appDir, name, port),
}).catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
