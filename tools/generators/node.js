const fs = require('fs');
const path = require('path');
const { generateNodeTsconfig } = require('./tsconfig-build');
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
  let variantFiles;
  if (variant === 'nestjs') {
    variantFiles = generateNestJsFiles(appDir, name);
  } else {
    variantFiles = generateExpressFiles(appDir, name, port);
  }

  const distPaths = resolveMonorepoDistPaths(variantFiles.entryPath, appDir, 'js');
  const packageJson = {
    name,
    version: '1.0.0',
    type: 'commonjs',
    main: distPaths.main,
    scripts: {
      dev: 'node-run dev',
      build: 'node-run build',
      start: 'node-run start',
    },
    dependencies: variantFiles.dependencies,
    devDependencies: variantFiles.devDependencies,
  };
  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(packageJson, null, 2),
  );

  fs.writeFileSync(
    path.join(appDir, 'tsconfig.json'),
    JSON.stringify(generateNodeTsconfig(), null, 2),
  );

  const envExample = `# Environment variables
# Copy this file to .env and set your values

PORT=${port}
`;
  fs.writeFileSync(path.join(appDir, '.env.example'), envExample);

  const env = `PORT=${port}
`;
  fs.writeFileSync(path.join(appDir, '.env'), env);

  const dockerfile = generateNodeDockerfile(name);
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), dockerfile);

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
      '.env',
      '.env.example',
      'Dockerfile',
      '.dockerignore',
    ],
    commands: [
      `pnpm --filter ${name} dev       # Dev режим`,
      `pnpm --filter ${name} build     # Сборка`,
      `pnpm --filter ${name} start     # Запуск собранного`,
    ],
    nextSteps: [`Открой http://localhost:${port}`],
  };
}

module.exports = { createNodeApp };
