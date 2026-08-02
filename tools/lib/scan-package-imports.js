'use strict';

const fs = require('fs');
const path = require('path');
const layout = require('./monorepo-layout');

// dist/build — на случай, если у какого-то пакета когда-то появится build-шаг
// (сейчас его нет ни у одного, см. tools/generators/package/create-package.js),
// .turbo/.cache/coverage — служебные, не исходники.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.turbo', '.cache', 'coverage']);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

/**
 * @param {string} dir
 * @param {string[]} out
 * @returns {string[]}
 */
function collectCodeFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      collectCodeFiles(path.join(dir, entry.name), out);
      continue;
    }
    if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/**
 * Импорт-спецификатор `@packages/<name>` — `from '...'`, side-effect
 * `import '...'`, динамический `import('...')`, `require('...')`, включая
 * подпути вроде `@packages/<name>/sub`. Якорится на from/import/require перед
 * кавычкой — не голый поиск строки по файлу, иначе совпадение в комментарии
 * или несвязанном строковом литерале тоже считалось бы импортом.
 * @param {string} pkgName
 */
function buildSpecifierRegex(pkgName) {
  return new RegExp(
    `(from\\s+|import\\(\\s*|import\\s+|require\\(\\s*)(['"\`])@packages/${pkgName}((?:/[^'"\`]*)?)\\2`,
    'g',
  );
}

/**
 * Ищет импорт-спецификаторы `@packages/<name>` в apps/* и packages/* —
 * намеренно НЕ во всём репозитории: tools/ (генераторы, CLI) может держать
 * `@packages/<name>` как часть ШАБЛОНА генерируемого кода (текст, который
 * генератор пишет в новый app), а не как реальный импорт самого файла —
 * regex это визуально не отличит от настоящего import'а и молча/неверно
 * поймал бы тулинг (найдено живьём: tools/generators/{nest,vite}/create-app.js
 * пишут `@tools/workspace-env` в шаблон env.ts). Только находит и
 * возвращает — ничего не пишет на диск, решение, что делать с находками
 * (переписать после подтверждения, просто предупредить), остаётся за
 * вызывающим.
 * @param {string} root
 * @param {string} pkgName
 * @returns {Array<{ absPath: string, relPosix: string, hunks: Array<{ line: number, match: string }> }>}
 */
function findPackageImportUsages(root, pkgName) {
  const specifierRegex = buildSpecifierRegex(pkgName);
  const scanRoots = [path.join(root, layout.APPS_REL), path.join(root, layout.PACKAGES_REL)];
  const result = [];

  for (const scanRoot of scanRoots) {
    if (!fs.existsSync(scanRoot)) continue;

    for (const file of collectCodeFiles(scanRoot)) {
      const content = fs.readFileSync(file, 'utf8');
      if (!content.includes(`@packages/${pkgName}`)) continue;

      const hunks = [];
      specifierRegex.lastIndex = 0;
      let match;
      while ((match = specifierRegex.exec(content))) {
        const line = content.slice(0, match.index).split('\n').length;
        hunks.push({ line, match: match[0] });
      }
      if (hunks.length === 0) continue;

      result.push({
        absPath: file,
        relPosix: path.relative(root, file).split(path.sep).join('/'),
        hunks,
      });
    }
  }

  return result;
}

module.exports = { collectCodeFiles, buildSpecifierRegex, findPackageImportUsages };
