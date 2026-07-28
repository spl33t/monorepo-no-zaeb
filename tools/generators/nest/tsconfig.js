/**
 * Nest (Nestia) app tsconfig — полностью самодостаточный, ничего не extends
 * из tools/ (раньше был `extends: '../../tools/tsconfig.nest.json'` — чистые
 * статические compilerOptions, инлайнить их дешевле, чем держать shared-файл
 * ради значений, которые генератор и так пишет один раз при скаффолдинге).
 *
 * packages/* — настоящие workspace-пакеты (workspace:* в package.json,
 * реальный node_modules-симлинк), apps/<name> больше не делит одну TS Program
 * с packages/* (алиас на relative-путь убран) — rootDir: 'src' (не весь
 * монорепо), emit — просто dist/main.js. rootDir нужен явно (TS6/TS5011:
 * без него — ошибка, даже когда сам же computed-root совпадает с этим значением).
 *
 * compilerOptions.plugins — собираются Nest CLI через ts-patch-пропатченный
 * typescript (persistent-патч, см. "prepare" в package.json), auto-discovery
 * из package.json ts-patch не умеет — typia/@nestia/core указаны явно.
 *
 * types: ["node"] — без явного списка nest build прекрасно auto-includeит все
 * @types/*, но nestia sdk грузит файлы через ts-node с уже распарсенными
 * compilerOptions (не сырой tsconfig.json) — тот auto-include не делает и падает
 * на любом node:* импорте («Cannot find name 'node:crypto'»). Проверено живьём.
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
      rootDir: 'src',
      outDir: 'dist',
      noEmit: false,
      types: ['node'],
      paths: {
        '@/*': ['./src/*'],
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
