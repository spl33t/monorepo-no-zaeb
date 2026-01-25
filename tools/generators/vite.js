const fs = require('fs');
const path = require('path');
const { generateViteDockerfile } = require('./vite-dockerfile-generator');
const { generateViteConfig } = require('./vite-config');
const { generateReactFiles } = require('./vite-variants/react');
const { generateVanillaFiles } = require('./vite-variants/vanilla');

/**
 * Генератор для Vite приложения (React или Vanilla)
 * @param {string} appDir - Директория приложения
 * @param {string} name - Название приложения
 * @param {string} framework - 'react' или 'vanilla'
 * @param {string} port - Порт приложения
 */
function createViteApp(appDir, name, framework, port = '80') {
  // Генерируем специфичные файлы в зависимости от фреймворка
  let variantFiles;
  if (framework === 'react') {
    variantFiles = generateReactFiles(appDir, name);
  } else {
    variantFiles = generateVanillaFiles(appDir, name);
  }

  // package.json (общий для всех Vite приложений)
  const packageJson = {
    name,
    version: '1.0.0',
    type: 'module',
    scripts: {
      'dev': 'vite',
      'build': 'tsc && vite build',
      'preview': 'vite preview'
    },
    dependencies: variantFiles.dependencies,
    devDependencies: variantFiles.devDependencies
  };

  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // tsconfig.json (основной файл с references)
  const tsconfig = {
    files: [],
    references: [
      { path: './tsconfig.app.json' },
      { path: './tsconfig.node.json' }
    ]
  };
  fs.writeFileSync(
    path.join(appDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );

  // tsconfig.node.json (для vite.config.ts)
  const tsconfigNode = {
    extends: '../../tsconfig.json',
    compilerOptions: {
      tsBuildInfoFile: './node_modules/.tmp/tsconfig.node.tsbuildinfo',
      target: 'ES2023',
      lib: ['ES2023'],
      module: 'ESNext',
      types: ['node'],
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      verbatimModuleSyntax: true,
      moduleDetection: 'force',
      noUnusedLocals: true,
      noUnusedParameters: true,
      erasableSyntaxOnly: true,
      noUncheckedSideEffectImports: true
    },
    include: ['vite.config.ts']
  };
  fs.writeFileSync(
    path.join(appDir, 'tsconfig.node.json'),
    JSON.stringify(tsconfigNode, null, 2)
  );

  // tsconfig.app.json (для приложения)
  const tsconfigApp = {
    extends: '../../tsconfig.json',
    compilerOptions: {
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      isolatedModules: true,
      jsx: framework === 'react' ? 'react-jsx' : 'preserve',
      noFallthroughCasesInSwitch: true
    },
    include: ['src']
  };
  fs.writeFileSync(
    path.join(appDir, 'tsconfig.app.json'),
    JSON.stringify(tsconfigApp, null, 2)
  );

  // index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${variantFiles.scriptSrc}"></script>
  </body>
</html>
`;
  fs.writeFileSync(path.join(appDir, 'index.html'), indexHtml);

  // vite.config.ts
  const viteConfig = generateViteConfig(framework);
  fs.writeFileSync(path.join(appDir, 'vite.config.ts'), viteConfig);
  
  // vite-env.d.ts (общий для всех Vite приложений)
  const viteEnv = `/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Примеры переменных окружения (раскомментируйте и добавьте свои):
  //readonly VITE_API_URL?: string;
  //readonly VITE_APP_TITLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv & Record<string, string | undefined>;
}
`;
  fs.writeFileSync(path.join(appDir, 'src/vite-env.d.ts'), viteEnv);
  
  // .env.example
  const envExample = `# Environment variables
# Copy this file to .env and set your values

PORT=${port}

# ВАЖНО: Только переменные с префиксом VITE_ доступны в клиентском коде
# VITE_API_URL=http://localhost:3000
# VITE_APP_TITLE=My App
`;
  fs.writeFileSync(path.join(appDir, '.env.example'), envExample);
  
  // .env (создаем сразу с теми же значениями)
  const env = `PORT=${port}
`;
  fs.writeFileSync(path.join(appDir, '.env'), env);

  // Dockerfile для Vite (multi-stage: build + development + production)
  const dockerfile = generateViteDockerfile(name);
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), dockerfile);

  // .dockerignore
  const dockerignore = `node_modules
dist
.env
.env.local
*.log
.DS_Store
.git
.gitignore
README.md
.vscode
.idea
`;
  fs.writeFileSync(path.join(appDir, '.dockerignore'), dockerignore);

  // Формируем структуру для вывода
  const structure = [
    'src/',
    ...variantFiles.structure
  ];
  
  structure.push('index.html');
  structure.push('vite.config.ts');
  structure.push('package.json');
  structure.push('tsconfig.json');
  structure.push('tsconfig.app.json');
  structure.push('tsconfig.node.json');
  structure.push('.env');
  structure.push('.env.example');
  structure.push('Dockerfile');
  structure.push('.dockerignore');

  return {
    structure,
    commands: [
      `pnpm --filter ${name} dev       # Dev сервер`,
      `pnpm --filter ${name} build     # Сборка`,
      `pnpm --filter ${name} preview   # Превью сборки`
    ],
    nextSteps: [
      `Открой http://localhost:${port}`
    ],
    envInfo: [
      'Переменные окружения:',
      '- Добавьте переменные с префиксом VITE_ в .env',
      '- Добавьте типы в src/vite-env.d.ts (примеры внутри)',
      '- Используйте: import.meta.env.VITE_YOUR_VAR'
    ]
  };
}

module.exports = { createViteApp };

