#!/usr/bin/env node

const path = require('path');
const { runCreateApp } = require('../../../tools/lib/create-app-shell');
const { createViteApp } = require('../generators/create-app');

const toolchainRoot = path.resolve(__dirname, '../..');

runCreateApp({
  world: 'vite',
  toolchainRoot,
  defaultPort: '80',
  defaultKind: 'react',
  title: 'Vite приложение (vite-apps)',
  frameworks: [
    { key: 'react', name: 'React + TypeScript' },
    { key: 'vanilla', name: 'Vanilla HTML + TypeScript' },
  ],
  kindAliases: {
    react: 'react',
    'vite-react': 'react',
    vanilla: 'vanilla',
    'vite-vanilla': 'vanilla',
  },
  helpText: `
Vite app → vite-apps/apps/<name>

  cd vite-apps && npm run create:app
  npm run create:app -- --kind react --name web [--port 80] [--no-install]

Флаги:
  --kind / --variant   react | vanilla (или vite-react | vite-vanilla)
  --name
  --port
  --no-install
`,
  generate: ({ appDir, name, port, kind }) =>
    createViteApp(appDir, name, kind || 'react', port),
}).catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
