const fs = require('fs');
const path = require('path');
const { generateViteDockerfile } = require('./dockerfile');
const { generateViteConfig } = require('./vite-config');
const { generateReactFiles } = require('./react-files');
const { generateVanillaFiles } = require('./vanilla-files');
const { generateEnvTs } = require('../shared/env-ts');
const { generateDockerignore } = require('../shared/dockerignore');

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
      dev: 'workspace-env --debug --watch vite',
      build: 'tsc && vite build',
      preview: 'workspace-env vite preview',
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
        // env.ts лежит рядом с package.json (вне src/) — алиас на конкретный
        // файл, а не паттерн. Из src/ безопасен только для VITE_*-полей
        // схемы (браузер резолвит их через import.meta.env, не process.env,
        // см. @tools/workspace-env exports#browser) — остальные поля тихо
        // вернут .default() или бросят при отсутствии.
        '@env': ['./env.ts'],
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

import type { env } from '../env';

// Типы ImportMetaEnv выведены из схемы env.ts (typeof env), а не продублированы
// руками — единственный источник правды. Pick строго по префиксу VITE_, а не
// typeof env целиком: только такие поля реально попадают в import.meta.env
// (ограничение самого Vite, см. tools/packages/workspace-env/README.md) —
// остальные (например PORT) в браузере реально undefined, взять весь typeof
// было бы враньём в типах. Аугментация нужна только тем, кто предпочитает
// сырой import.meta.env.VITE_X вместо import { env } from '@env' — у обоих
// один источник схемы.
type ViteEnvFields<T> = {
  [K in keyof T as K extends \`VITE_\${string}\` ? K : never]: T[K];
};

declare global {
  interface ImportMetaEnv extends Readonly<ViteEnvFields<typeof env>> {}
  // Без этого у vite/client ImportMetaEnv по умолчанию имеет permissive
  // fallback (Record<string, any>) — любой ключ (включая не-VITE_, например
  // PORT) тайпчекался бы независимо от аугментации выше, сводя Pick-фильтр
  // на нет. Официальный opt-in из самого vite/client (importMeta.d.ts).
  interface ViteTypeOptions {
    strictImportMetaEnv: unknown;
  }
}
`,
  );

  fs.writeFileSync(path.join(appDir, '.env'), `PORT=${port}\n`);
  // workspace-env (root devDependency) требует env.ts рядом с .env — без
  // него структурная ошибка ("непровалидированные значения без схемы"),
  // см. tools/packages/workspace-env/README.md. Отдельного .env.example
  // больше нет — env.ts (закоммиченная типизированная схема) и есть
  // документация того, какие переменные нужны.
  fs.writeFileSync(path.join(appDir, 'env.ts'), generateEnvTs(Number(port)));
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), generateViteDockerfile(name));
  fs.writeFileSync(path.join(appDir, '.dockerignore'), generateDockerignore());

  return {
    structure: [
      'src/',
      ...variantFiles.structure,
      'index.html',
      'vite.config.ts',
      'package.json',
      'tsconfig.json',
      '.env',
      'env.ts',
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
      'Переменные для src/: префикс VITE_ в .env, схема + доступ через import { env } from \'@env\'',
    ],
  };
}

module.exports = { createViteApp };
