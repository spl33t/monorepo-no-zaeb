const fs = require('fs');
const path = require('path');
const { generateTsdownConfig } = require('./tsdown-config');
const { resolveMonorepoDistPaths } = require('../lib/monorepo-dist.ts');
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
  const distPaths = resolveMonorepoDistPaths(variantFiles.entryPath, appDir);
  const packageJson = {
    name,
    version: '1.0.0',
    type: 'module',
    main: distPaths.main,
    scripts: {
      dev: 'node-run dev',
      build: 'node-run build',
      start: 'node-run start'
    },
    dependencies: variantFiles.dependencies,
    devDependencies: variantFiles.devDependencies,
  };
  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // tsconfig.json — только src/; @monorepo/* через paths (без include packages — иначе rootDir ломается)
  const tsconfig = {
    extends: '../../tsconfig.json',
    compilerOptions: {
      module: 'ESNext',
      moduleResolution: 'bundler',
      noEmit: true,
      paths: {
        '@/*': ['./src/*'],
        '@monorepo/*': ['../../packages/*/src']
      }
    },
    include: ['src/**/*']
  };
  fs.writeFileSync(
    path.join(appDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );

  // tsdown.config.ts (общий, но с разными entry путями)
  const tsdownConfig = generateTsdownConfig(variantFiles.entryPath, appDir);
  fs.writeFileSync(path.join(appDir, 'tsdown.config.ts'), tsdownConfig);

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
