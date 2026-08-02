/**
 * Nest (Nestia) app tsconfig — полностью самодостаточный, ничего не extends
 * из tools/ (раньше был `extends: '../../tools/tsconfig.nest.json'` — чистые
 * статические compilerOptions, инлайнить их дешевле, чем держать shared-файл
 * ради значений, которые генератор и так пишет один раз при скаффолдинге).
 *
 * packages/* — настоящие workspace-пакеты (workspace:* в package.json,
 * реальный node_modules-симлинк), apps/<name> больше не делит одну TS Program
 * с packages/* (алиас на relative-путь убран). rootDir нужен явно (TS6/TS5011:
 * без него — ошибка, даже когда сам же computed-root совпадает с этим значением).
 *
 * rootDir: '.' (корень app'а), а не 'src' — иначе TS6059 ("File is not under
 * rootDir") на КАЖДЫЙ импорт `@env` (env.ts лежит рядом с package.json, вне
 * src/, см. paths ниже): в webpack-сборке это заглушено ignoreDiagnostics
 * в webpack-config.js (см. его комментарий) — тот фикс работает только для
 * ts-loader, IDE/tsserver читает tsconfig.json напрямую и продолжает светить
 * ошибку. rootDir: '.' не меняет реальный вывод сборки — nest build бандлит
 * через webpack в один dist/main.js независимо от rootDir (проверено
 * живьём: dist/main.js на прежнем месте что при 'src', что при '.'), и
 * `nestia sdk` (свой отдельный ts-node/tsconfig-paths путь) тоже не задет
 * (проверено живьём). include: ['src'] по-прежнему ограничивает явный набор
 * файлов Program — rootDir здесь влияет только на диагностику/output-path
 * вычисление, не на то, что попадает в компиляцию.
 *
 * compilerOptions.plugins — собираются Nest CLI через ts-patch-пропатченный
 * typescript (persistent-патч, см. "prepare" в package.json), auto-discovery
 * из package.json ts-patch не умеет — typia/@nestia/core указаны явно.
 *
 * types: ["node", "express"] — без явного списка nest build прекрасно
 * auto-includeит все @types/*, но nestia sdk грузит файлы через ts-node с уже
 * распарсенными compilerOptions (не сырой tsconfig.json) — тот auto-include
 * не делает и падает на любом node:* импорте («Cannot find name
 * 'node:crypto'»). Проверено живьём.
 *
 * "express" в списке — не для nestia, а чтобы src/types/global.ts
 * (declare global { namespace Express { interface Request {...} } }) был
 * СВЯЗАН с настоящим Express.Request с самого скаффолда, а не только с
 * момента, когда где-то впервые появится import ... from 'express'. Без
 * этого @types/express физически не попадает в Program (проверено живьём:
 * 0 файлов @types/express в дефолтном скаффолде без единого import from
 * 'express' где-либо), и аугментация в global.ts компилируется как ничем не
 * связанный orphan-интерфейс — молча ничего не делает, без единой ошибки.
 * С "express" в types — @types/express в Program с первого дня, мердж
 * реальный сразу.
 */
function generateNodeTsconfig() {
  return {
    compilerOptions: {
      target: 'ES2020',
      module: 'CommonJS',
      lib: ['ES2020'],
      strict: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
      sourceMap: true,
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      exactOptionalPropertyTypes: true,
      rootDir: '.',
      outDir: 'dist',
      noEmit: false,
      types: ['node', 'express'],
      paths: {
        '@/*': ['./src/*'],
        // env.ts лежит рядом с package.json (вне rootDir: 'src') — алиас на
        // конкретный файл, а не паттерн, чтобы из любой глубины src/ можно
        // было писать import { env } from '@env' вместо ../../../env.
        '@env': ['./env.ts'],
      },
      plugins: [
        { transform: 'typia/lib/transform' },
        { transform: '@nestia/core/lib/transform', validate: 'validate', stringify: 'assert' },
      ],
    },
    include: ['src'],
  };
}

module.exports = { generateNodeTsconfig };
