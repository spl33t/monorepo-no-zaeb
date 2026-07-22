const fs = require('fs');
const path = require('path');
const { generateViteDockerfile } = require('./dockerfile');
const { generateViteConfig } = require('./vite-config');
const { generateReactFiles } = require('./react-files');
const { generateVanillaFiles } = require('./vanilla-files');

/**
 * Vite app under vite-apps/apps/<name>.
 */
function createViteApp(appDir, name, framework, port = '80') {
  const variantFiles =
    framework === 'react'
      ? generateReactFiles(appDir, name)
      : generateVanillaFiles(appDir, name);

  const packageJson = {
    name: `@apps/${name}`,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc && vite build',
      preview: 'vite preview',
    },
    devDependencies: {
      '@monorepo/vite-cli': '*',
    },
  };

  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(packageJson, null, 2));

  const tsconfig = {
    extends: '../../tsconfig.json',
    compilerOptions: {
      ...(framework === 'vanilla' ? { jsx: 'preserve' } : {}),
      paths: {
        '@/*': ['./src/*'],
        '@monorepo/*': ['../../packages/*'],
      },
    },
    include: ['src', 'vite.config.ts'],
  };
  fs.writeFileSync(path.join(appDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

  fs.writeFileSync(
    path.join(appDir, 'index.html'),
    `<!DOCTYPE html>
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
`,
  );

  fs.writeFileSync(path.join(appDir, 'vite.config.ts'), generateViteConfig(framework));

  fs.writeFileSync(
    path.join(appDir, 'src/vite-env.d.ts'),
    `/// <reference types="vite/client" />

interface ImportMetaEnv {
  //readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv & Record<string, string | undefined>;
}
`,
  );

  fs.writeFileSync(
    path.join(appDir, '.env.example'),
    `# Environment variables
PORT=${port}

# Только VITE_* доступны в клиенте
# VITE_API_URL=http://localhost:3000
`,
  );
  fs.writeFileSync(path.join(appDir, '.env'), `PORT=${port}\n`);
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), generateViteDockerfile(name));
  fs.writeFileSync(
    path.join(appDir, '.dockerignore'),
    `node_modules\ndist\n.env\n.env.local\n*.log\n.DS_Store\n.git\n.gitignore\nREADME.md\n.vscode\n.idea\n`,
  );

  return {
    structure: [
      'src/',
      ...variantFiles.structure,
      'index.html',
      'vite.config.ts',
      'package.json',
      'tsconfig.json',
      '.env',
      '.env.example',
      'Dockerfile',
      '.dockerignore',
    ],
    commands: [
      `npm run dev -w @apps/${name}`,
      `npm run build -w @apps/${name}`,
      `npm run preview -w @apps/${name}`,
    ],
    nextSteps: [`Открой http://localhost:${port}`],
    envInfo: [
      'Переменные: префикс VITE_ в .env, типы в src/vite-env.d.ts',
    ],
  };
}

module.exports = { createViteApp };
