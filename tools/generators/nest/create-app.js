const fs = require('fs');
const path = require('path');
const { generateNestFiles } = require('./files');
const { generateNodeTsconfig } = require('./tsconfig');
const { generateNodeDockerfile } = require('./dockerfile');
const { generateWebpackConfig } = require('./webpack-config');

/**
 * @param {string} appDir
 * @param {string} name
 * @param {string} [port]
 */
function createNestApp(appDir, name, port = '3000') {
  const variantFiles = generateNestFiles(appDir, name);
  const entry = `dist/main.js`;
  // cross-env — root devDependency; pnpm сам добавляет
  // <workspace root>/node_modules/.bin в PATH для скриптов любого app.
  const xenv = 'cross-env';

  /** @type {Record<string, unknown>} */
  const packageJson = {
    name: `@apps/${name}`,
    version: '1.0.0',
    private: true,
    type: 'commonjs',
    main: `./${entry}`,
    monorepo: { kind: 'nest' },
    scripts: {
      // Nest CLI собирает через свой webpack-билдер (nest-cli.json: webpack +
      // webpackConfigPath) — дефолтный tsc-билдер несовместим с сырыми
      // packages/* (workspace:*, без build-шага): typia/ts-patch крашится
      // при их компиляции (transformBundle: Cannot read properties of
      // undefined). webpack.config.js — 4 доработки дефолтного конфига,
      // все обоснованы в самом файле. ts-patch (persistent-патч, см.
      // "prepare") патчит локальный typescript — compilerOptions.plugins
      // из tsconfig.json (typia, @nestia/core) применяются прозрачно и
      // ts-loader'у тоже, раз он использует тот же patched typescript.
      // --enable-source-maps — иначе стектрейсы указывают на dist/main.js
      // построчно, а не на реальный исходник (webpack.config.js уже пишет
      // .map, но сам Node должен явно их использовать).
      dev: `${xenv} NODE_ENV=development NODE_OPTIONS=--enable-source-maps nest start --watch`,
      build: 'nest build',
      start: `${xenv} NODE_ENV=production node --enable-source-maps ${entry}`,
      sdk: 'nestia sdk --project tsconfig.json',
      prepare: 'ts-patch install',
    },
    // Правило (проверено живьём — чистый Docker-билд, --prod --ignore-scripts,
    // без кэша): пакет обязан быть в dependencies, если СКОМПИЛИРОВАННЫЙ код
    // apps/<name>/src напрямую его require()'ит (резолвится от
    // apps/<name>/node_modules) — например typia: transform @nestia/core
    // вставляет `require('typia/lib/internal/...')` прямо в транспилированный
    // app.controller.ts. @nestia/fetcher и reflect-metadata под это правило
    // не попадают — нигде не require()'ятся нашим кодом — и безопасно убраны.
    //
    // @nestjs/platform-express — ИСКЛЮЧЕНИЕ из общего "нужен только другой
    // зависимости — можно не объявлять": @nestjs/core объявляет его как
    // ОПЦИОНАЛЬНЫЙ peerDependency (наравне с reflect-metadata/rxjs как
    // обязательными peer). pnpm резолвит peer-зависимости per-context —
    // разные наборы явных deps у разных потребителей могут дать РАЗНЫЕ
    // физические экземпляры одного и того же @nestjs/core в .pnpm-store,
    // и один из них может быть собран БЕЗ platform-express как соседа.
    // NestFactory.create() без явного адаптера делает динамический
    // require('@nestjs/platform-express') — если резолвится "не тот"
    // экземпляр @nestjs/core, падает в рантайме: "No driver (HTTP) has been
    // selected" (проверено живьём: свежий scaffold без явного platform-express
    // не поднимался; добавление его обратно в dependencies чинит резолв).
    // Дедупликация в один инстанс, на которую опирается общее правило выше,
    // работает только для обычных (не peer) зависимостей.
    dependencies: {
      '@nestia/core': 'catalog:nest',
      '@nestjs/common': 'catalog:nest',
      '@nestjs/core': 'catalog:nest',
      '@nestjs/platform-express': 'catalog:nest',
      dotenv: 'catalog:nest',
      typia: 'catalog:nest',
    },
    // ts-loader и webpack-node-externals — то же правило, что у dependencies
    // (см. выше), только для build-time: наш собственный webpack.config.js
    // напрямую делает require('webpack-node-externals'), а webpack сам
    // резолвит строку 'ts-loader' из nest-cli.json как имя loader'а — оба
    // резолвятся именно от apps/<name>/node_modules, без explicit deps
    // сборка падает с "Module not found" (проверено). tsconfig-paths раньше
    // тоже был здесь (для nestia sdk, который грузит nestia.config.ts через
    // ts-node) — убран: @nestia/sdk теперь сам зависит от tsconfig-paths
    // в своём package.json, дублировать незачем (проверено живьём, включая
    // сам `nestia sdk`, без него всё генерируется корректно).
    devDependencies: {
      '@nestia/sdk': 'catalog:nest',
      '@nestjs/cli': 'catalog:nest',
      '@types/node': 'catalog:shared',
      nestia: 'catalog:nest',
      'ts-loader': 'catalog:nest',
      'ts-patch': 'catalog:nest',
      typescript: 'catalog:shared',
      'webpack-node-externals': 'catalog:nest',
    },
  };

  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  fs.writeFileSync(
    path.join(appDir, 'tsconfig.json'),
    JSON.stringify(generateNodeTsconfig(), null, 2),
  );
  fs.writeFileSync(
    path.join(appDir, 'nest-cli.json'),
    // entryFile не переопределяем — дефолт "main" уже верный (rootDir app'а
    // локальный, dist/main.js, без вложенной структуры монорепо).
    // deleteOutDir — чистит dist перед каждой сборкой.
    // manualRestart — `rs` + Enter в watch-режиме, ручной restart без правки файла.
    // webpack + webpackConfigPath — см. webpack.config.js и комментарий у scripts.
    `${JSON.stringify(
      {
        collection: '@nestjs/schematics',
        sourceRoot: 'src',
        compilerOptions: {
          deleteOutDir: true,
          manualRestart: true,
          webpack: true,
          webpackConfigPath: 'webpack.config.js',
        },
      },
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(path.join(appDir, 'webpack.config.js'), generateWebpackConfig());

  fs.writeFileSync(
    path.join(appDir, '.env.example'),
    `# Environment variables\n# Copy this file to .env and set your values\n\nPORT=${port}\n`,
  );
  fs.writeFileSync(path.join(appDir, '.env'), `PORT=${port}\n`);
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), generateNodeDockerfile(name));
  fs.writeFileSync(
    path.join(appDir, '.dockerignore'),
    `node_modules\ndist\n.env\n.env.local\n*.log\n.DS_Store\n.git\n.gitignore\nREADME.md\n.vscode\n.idea\n`,
  );

  const structure = [
    'src/',
    ...variantFiles.structure,
    'package.json',
    'tsconfig.json',
    'nest-cli.json',
    'webpack.config.js',
    'Dockerfile',
    '.dockerignore',
    '.env.example',
    '.env',
  ];

  return {
    structure,
    commands: [
      `pnpm --filter @apps/${name} dev`,
      `pnpm --filter @apps/${name} build`,
    ],
    nextSteps: [
      `SDK: pnpm run sdk → packages/${name}-api (создастся автоматически при первом запуске).`,
    ],
  };
}

module.exports = { createNestApp };
