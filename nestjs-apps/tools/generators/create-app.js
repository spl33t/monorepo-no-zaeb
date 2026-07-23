const fs = require('fs');
const path = require('path');
const { generateNestJsFiles, generateNestiaFiles } = require('./nestjs-files');
const { generateNodeTsconfig } = require('./tsconfig-app');
const { generateNodeDockerfile } = require('./dockerfile');

function nestCliConfig(appName) {
  return {
    $schema: 'https://json.schemastore.org/nest-cli',
    collection: '@nestjs/schematics',
    sourceRoot: 'src',
    entryFile: `nestjs-apps/apps/${appName}/src/main`,
    compilerOptions: {
      deleteOutDir: true,
      webpack: false,
      tsConfigPath: 'tsconfig.json',
    },
  };
}

/** Nestia/ttsc на app (как nestia.io/docs/setup): свой TS 7 + ttsc, не в корне тулчейна. */
function nestiaAppDependencies() {
  return {
    dependencies: {
      '@nestia/core': '^12.0.0',
      '@nestia/fetcher': '^12.0.0',
      '@nestia/sdk': '^12.0.0',
      typia: '^13.2.0',
    },
    devDependencies: {
      concurrently: '^9.0.0',
      nestia: '^12.0.0',
      ttsc: '^0.19.2',
      typescript: '~7.0.2',
    },
  };
}

/**
 * @param {string} appDir
 * @param {string} name
 * @param {'nestjs'|'nestia'} kind
 * @param {string} [port]
 */
function createNestApp(appDir, name, kind = 'nestjs', port = '3000') {
  const isNestia = kind === 'nestia';
  const variantFiles = isNestia
    ? generateNestiaFiles(appDir, name)
    : generateNestJsFiles(appDir, name);
  const entry = `dist/nestjs-apps/apps/${name}/src/main.js`;
  // cross-env — root dependency; npm run сам добавляет node_modules/.bin каждого предка в PATH
  // (@npmcli/run-script, set-path.js) — резолвится без префиксов/шимов.
  const xenv = 'cross-env';

  /** @type {Record<string, unknown>} */
  const packageJson = {
    name: `@apps/${name}`,
    version: '1.0.0',
    private: true,
    type: 'commonjs',
    main: `./${entry}`,
    scripts: isNestia
      ? {
          // nestia.io/docs/setup: ttsc --watch + node --watch (ttsx без reload)
          dev: `${xenv} NODE_ENV=development ttsc -p tsconfig.json && ${xenv} NODE_ENV=development concurrently -k "ttsc -p tsconfig.json --watch --preserveWatchOutput" "node --watch ${entry}"`,
          build: 'ttsc -p tsconfig.json',
          start: `${xenv} NODE_ENV=production node ${entry}`,
          'start:script': `${xenv} NODE_ENV=development ttsx src/main.ts`,
          sdk: 'nestia sdk --project ../../tsconfig.nestia-sdk.json',
        }
      : {
          dev: `${xenv} NODE_ENV=development nest start --watch`,
          build: 'nest build',
          start: `${xenv} NODE_ENV=production node ${entry}`,
        },
  };

  if (isNestia) {
    Object.assign(packageJson, nestiaAppDependencies());
  }

  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  fs.writeFileSync(
    path.join(appDir, 'tsconfig.json'),
    JSON.stringify(generateNodeTsconfig(), null, 2),
  );

  if (!isNestia) {
    fs.writeFileSync(
      path.join(appDir, 'nest-cli.json'),
      `${JSON.stringify(nestCliConfig(name), null, 2)}\n`,
    );
  } else {
    // nestia sdk: rootDir = dirname(--project) → nestjs-apps/ (root packages/ через ../packages)
    const toolchainRoot = path.join(appDir, '..', '..');
    const sdkTsconfig = path.join(toolchainRoot, 'tsconfig.nestia-sdk.json');
    if (!fs.existsSync(sdkTsconfig)) {
      fs.writeFileSync(
        sdkTsconfig,
        `${JSON.stringify(
          {
            extends: './tsconfig.json',
            compilerOptions: {
              noEmit: false,
              paths: {
                '@root-packages/*': ['../packages/*'],
                '@toolchain-packages/*': ['./packages/*'],
              },
            },
            include: ['apps/**/*.ts', 'packages/**/*.ts', '../packages/**/*.ts'],
            exclude: ['**/node_modules', '**/dist', '**/src/api'],
          },
          null,
          2,
        )}\n`,
      );
    }
  }

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
    ...(isNestia ? [] : ['nest-cli.json']),
    'Dockerfile',
    '.dockerignore',
    '.env.example',
    '.env',
  ];

  return {
    structure,
    commands: [`npm run dev -w @apps/${name}`, `npm run build -w @apps/${name}`],
    nextSteps: isNestia
      ? [
          'SDK: задай SDK_OUTPUT в nestia.config.ts, затем npm run sdk (--project ../../tsconfig.nestia-sdk.json).',
        ]
      : undefined,
  };
}

module.exports = { createNestApp };
