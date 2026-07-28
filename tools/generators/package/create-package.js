const fs = require('fs');
const path = require('path');

/**
 * packages/<name> — обычный pnpm-пакет (workspace:*), не alias. Без build
 * шага: package.json#main/exports указывают прямо на src/index.ts, компилирует
 * его сам потребитель (Vite — нативно через esbuild/Rollup; Nest — через
 * webpack-билдер приложения, см. apps/<name>/webpack.config.js, где @packages/*
 * явно исключён из externals ради этого). Раньше пакеты собирались отдельно
 * (tsup, dual ESM+CJS) — универсальнее (Nest-стороне ничего не требовалось
 * настраивать), но требовало build-шага и своего dist/. Проверено живьём
 * в обоих потребителях, включая изоляцию собственных npm-зависимостей
 * пакета (dayjs как пример) — резолвятся из packages/<name>/node_modules,
 * не зависят от того, что установлено у потребителя.
 * @param {string} pkgDir
 * @param {string} name
 */
function createPackage(pkgDir, name) {
  const packageJson = {
    name: `@packages/${name}`,
    version: '1.0.0',
    private: true,
    main: './src/index.ts',
    types: './src/index.ts',
    exports: {
      '.': './src/index.ts',
    },
  };

  fs.mkdirSync(path.join(pkgDir, 'src'), { recursive: true });

  fs.writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);

  fs.writeFileSync(
    path.join(pkgDir, 'src/index.ts'),
    `export function hello(): string {
  return 'Hello from @packages/${name}';
}
`,
  );

  return {
    structure: ['src/index.ts', 'package.json'],
    commands: [],
  };
}

module.exports = { createPackage };
