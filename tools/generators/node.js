const fs = require('fs');
const path = require('path');
const { generateTsdownConfig } = require('./tsdown-config');
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
    main: './dist/index.cjs',
    scripts: {
      build: 'tsdown',
      dev: 'tsdown --dev',
      start: 'node --enable-source-maps dist/index.cjs'
    },
    dependencies: variantFiles.dependencies,
    devDependencies: variantFiles.devDependencies
  };
  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // tsconfig.json (общий для всех Node.js приложений)
  const tsconfig = {
    extends: '../../tsconfig.json',
    compilerOptions: {
      outDir: './dist'
    },
    include: ['src/**/*']
  };
  fs.writeFileSync(
    path.join(appDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );

  // tsdown.config.ts (общий, но с разными entry путями)
  const tsdownConfig = generateTsdownConfig(variantFiles.entryPath);
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
      `npm run dev --workspace=${name}       # Dev режим`,
      `npm run build --workspace=${name}     # Сборка`,
      `npm run start --workspace=${name}     # Запуск собранного`
    ],
    nextSteps: variant === 'nestjs' ? [
      `Открой http://localhost:${port}`
    ] : undefined
  };
}

module.exports = { createNodeApp };
