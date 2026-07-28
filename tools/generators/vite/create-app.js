const fs = require('fs');
const path = require('path');
const { generateViteDockerfile } = require('./dockerfile');
const { generateViteConfig } = require('./vite-config');
const { generateReactFiles } = require('./react-files');
const { generateVanillaFiles } = require('./vanilla-files');

/**
 * Vite app under apps/<name>.
 * @param {string} appDir
 * @param {string} name
 * @param {'react'|'vanilla'} framework
 * @param {string} [port]
 */
function createViteApp(appDir, name, framework, port = '5173') {
  const variantFiles =
    framework === 'react'
      ? generateReactFiles(appDir, name)
      : generateVanillaFiles(appDir, name);

  const packageJson = {
    name: `@apps/${name}`,
    version: '1.0.0',
    private: true,
    type: 'module',
    monorepo: { kind: 'vite' },
    scripts: {
      dev: 'vite',
      build: 'tsc && vite build',
      preview: 'vite preview',
    },
    dependencies:
      framework === 'react'
        ? {
            react: 'catalog:vite',
            'react-dom': 'catalog:vite',
          }
        : {},
    devDependencies: {
      '@types/node': 'catalog:shared',
      typescript: 'catalog:shared',
      vite: 'catalog:vite',
      ...(framework === 'react'
        ? {
            '@types/react': 'catalog:vite',
            '@types/react-dom': 'catalog:vite',
            '@vitejs/plugin-react': 'catalog:vite',
          }
        : {}),
    },
  };

  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(packageJson, null, 2));

  // Инлайн вместо extends из tools/tsconfig.vite.json — чистые статические
  // compilerOptions, отдельный shared-файл не даёт ничего сверх того, что уже
  // пишет генератор.
  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: framework === 'vanilla' ? 'preserve' : 'react-jsx',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      isolatedModules: true,
      moduleDetection: 'force',
      useDefineForClassFields: true,
      allowImportingTsExtensions: true,
      noFallthroughCasesInSwitch: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      resolveJsonModule: true,
      types: ['vite/client', 'node'],
      paths: {
        '@/*': ['./src/*'],
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
      `pnpm --filter @apps/${name} dev`,
      `pnpm --filter @apps/${name} build`,
      `pnpm --filter @apps/${name} preview`,
    ],
    nextSteps: [`Открой http://localhost:${port}`],
    envInfo: [
      'Переменные: префикс VITE_ в .env, типы в src/vite-env.d.ts',
    ],
  };
}

module.exports = { createViteApp };
