const fs = require('fs');
const path = require('path');
const { generateNestJsFiles } = require('./nestjs-files');
const { generateNodeTsconfig } = require('./tsconfig-app');
const { generateNodeDockerfile } = require('./dockerfile');

function nestCliConfig(appName) {
  return {
    $schema: 'https://json.schemastore.org/nest-cli',
    collection: '@nestjs/schematics',
    sourceRoot: 'src',
    // tsc emit: dist/apps/<name>/src/main.js (+ dist/packages/…)
    entryFile: `apps/${appName}/src/main`,
    compilerOptions: {
      deleteOutDir: true,
      webpack: false,
      tsConfigPath: 'tsconfig.json',
    },
  };
}

/**
 * Scaffold NestJS app into nestjs-apps/apps/<name>.
 */
function createNestApp(appDir, name, port = '3000') {
  const variantFiles = generateNestJsFiles(appDir, name);
  const entry = `dist/apps/${name}/src/main.js`;

  const packageJson = {
    name: `@apps/${name}`,
    version: '1.0.0',
    private: true,
    type: 'commonjs',
    main: `./${entry}`,
    scripts: {
      dev: 'nest start --watch',
      build: 'nest build',
      start: `node ${entry}`,
    },
    devDependencies: {
      '@monorepo/nest-cli': '*',
    },
  };
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  fs.writeFileSync(
    path.join(appDir, 'tsconfig.json'),
    JSON.stringify(generateNodeTsconfig(), null, 2),
  );
  fs.writeFileSync(
    path.join(appDir, 'nest-cli.json'),
    `${JSON.stringify(nestCliConfig(name), null, 2)}\n`,
  );

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

  return {
    structure: [
      'src/',
      ...variantFiles.structure,
      'package.json',
      'tsconfig.json',
      'nest-cli.json',
      'Dockerfile',
      '.dockerignore',
      '.env.example',
      '.env',
    ],
    commands: [`npm run dev -w @apps/${name}`, `npm run build -w @apps/${name}`],
  };
}

module.exports = { createNestApp };
