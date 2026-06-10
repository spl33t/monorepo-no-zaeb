const fs = require('fs');
const path = require('path');
const { generateTsdownConfig } = require('./tsdown-config');
const { generateRunScript } = require('./run');
const { generateNodeDockerfile } = require('./node-dockerfile-generator');
const { generateNestJsFiles } = require('./node-variants/nestjs');
const { generateExpressFiles } = require('./node-variants/express');

/**
 * Генератор для Node.js приложений (NestJS или Express/Plain)
 * @param {string} appDir - Директория приложения
 * @param {string} name - Название приложения
 * @param {string} variant - 'nestjs' или 'express'
 * @param {string} port - Порт приложения
 */
function createNodeApp(appDir, name, variant, port = '3000') {
  // Генерируем специфичные файлы в зависимости от варианта
  let variantFiles;
  if (variant === 'nestjs') {
    variantFiles = generateNestJsFiles(appDir, name);
  } else {
    variantFiles = generateExpressFiles(appDir, name, port);
  }

  // package.json (общий для всех Node.js приложений)
  const packageJson = {
    name,
    version: '1.0.0',
    type: 'module',
    main: './dist/index.cjs',
    scripts: {
      dev: 'node --experimental-strip-types run.ts dev',
      build: 'node --experimental-strip-types run.ts build',
      start: 'node --experimental-strip-types run.ts start'
    },
    dependencies: variantFiles.dependencies,
    devDependencies: variantFiles.devDependencies
  };
  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // tsconfig.json (общий для всех Node.js/tsdown приложений)
  const tsconfig = {
    extends: '../../tsconfig.json',
    compilerOptions: {
      outDir: './dist',
      baseUrl: '.',
      paths: {
        '@/*': ['src/*'],
        '@monorepo/*': ['../../packages/*/src']
      }
    },
    include: ['src/**/*', '../../packages/*/src/**/*']
  };
  fs.writeFileSync(
    path.join(appDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );

  // tsdown.config.ts (общий, но с разными entry путями)
  const tsdownConfig = generateTsdownConfig(variantFiles.entryPath);
  fs.writeFileSync(path.join(appDir, 'tsdown.config.ts'), tsdownConfig);

  // run.ts — dev/build/start оркестратор (tsdown + tsc + node, restart по .ready / .env)
  fs.writeFileSync(path.join(appDir, 'run.ts'), generateRunScript());

  // .env.example (общий)
  const envExample = `# Environment variables
# Copy this file to .env and set your values

PORT=${port}
`;
  fs.writeFileSync(path.join(appDir, '.env.example'), envExample);
  
  // .env (общий)
  const env = `PORT=${port}
`;
  fs.writeFileSync(path.join(appDir, '.env'), env);

  // Dockerfile (общий)
  const dockerfile = generateNodeDockerfile(name);
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), dockerfile);

  // .dockerignore (общий)
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

  return {
    structure: [
      'src/',
      ...variantFiles.structure,
      'package.json',
      'tsconfig.json',
      'tsdown.config.ts',
      'run.ts',
      '.env',
      '.env.example',
      'Dockerfile',
      '.dockerignore'
    ],
    commands: [
      `pnpm --filter ${name} dev       # Dev режим`,
      `pnpm --filter ${name} build     # Сборка`,
      `pnpm --filter ${name} start     # Запуск собранного`
    ],
    nextSteps: [
      `Открой http://localhost:${port}`
    ]
  };
}

module.exports = { createNodeApp };
