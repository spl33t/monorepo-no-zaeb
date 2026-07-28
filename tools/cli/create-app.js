#!/usr/bin/env node

const path = require('path');
const { runCreateApp } = require('../lib/create-app-shell');
const { createNestApp } = require('../generators/nest/create-app');
const { createViteApp } = require('../generators/vite/create-app');

const monorepoRoot = path.resolve(__dirname, '../..');

runCreateApp({
  monorepoRoot,
  title: 'Новое приложение (apps/)',
  frameworks: [
    { key: 'nest', name: 'Nest (Nestia + typia, ts-patch)', defaultPort: '3000' },
    { key: 'react', name: 'Vite + React', defaultPort: '5173' },
    { key: 'vanilla', name: 'Vite + Vanilla TS', defaultPort: '5173' },
  ],
  helpText: `
Приложение → apps/<name>

Интерактивно:
  pnpm run create:app

Одна команда:
  pnpm run create:app -- --kind nest --name api [--port 3000] [--no-install]
  pnpm run create:app -- --kind react --name web [--port 5173] [--no-install]
  pnpm run create:app -- --kind vanilla --name web

Флаги:
  --kind                nest | react | vanilla
  --name                a-z, 0-9, дефис
  --port                1–65535
  --no-install
`,
  generate: ({ appDir, name, port, key }) => {
    if (key === 'nest') return createNestApp(appDir, name, port);
    return createViteApp(appDir, name, key, port);
  },
}).catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
