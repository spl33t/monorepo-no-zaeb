#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const layout = require('../lib/monorepo-layout');
const { collectCodeFiles, buildSpecifierRegex } = require('../lib/scan-package-imports');

/**
 * `@inquirer/prompts` — ESM-only с v8, грузится через динамический `import()`
 * — стандартный мост ESM→CJS в Node.
 * @returns {Promise<{ select: Function, input: Function, confirm: Function }>}
 */
function loadPrompts() {
  return import('@inquirer/prompts');
}

function parseArgv(argv) {
  const out = { help: false, noInstall: false, yes: false, oldName: undefined, newName: undefined };
  const positional = [];
  for (const a of argv) {
    if (a === '--') continue;
    if (a === '-h' || a === '--help') {
      out.help = true;
      continue;
    }
    if (a === '--no-install') {
      out.noInstall = true;
      continue;
    }
    if (a === '--yes') {
      out.yes = true;
      continue;
    }
    if (a.startsWith('-')) throw new Error(`Неизвестный флаг: ${a}`);
    positional.push(a);
  }
  out.oldName = positional[0];
  out.newName = positional[1];
  return out;
}

function validateName(name) {
  return Boolean(name && /^[a-z0-9-]+$/.test(name));
}

/**
 * Ищет импорт-спецификаторы `@packages/<old>` в apps/* и packages/* (не
 * tools/ — см. tools/lib/scan-package-imports.js) и заодно считает, во что
 * их переписать. Результат — только ПРЕВЬЮ, ничего не пишет на диск; запись —
 * отдельным шагом после явного подтверждения (applyImportUsages).
 * @param {string} root
 * @param {string} oldName
 * @param {string} newName
 * @returns {Array<{ absPath: string, relPosix: string, next: string, hunks: Array<{ line: number, before: string, after: string }> }>}
 */
function scanImportUsages(root, oldName, newName) {
  const specifierRegex = buildSpecifierRegex(oldName);
  const scanRoots = [path.join(root, layout.APPS_REL), path.join(root, layout.PACKAGES_REL)];
  const result = [];

  for (const scanRoot of scanRoots) {
    if (!fs.existsSync(scanRoot)) continue;

    for (const file of collectCodeFiles(scanRoot)) {
      const content = fs.readFileSync(file, 'utf8');
      if (!content.includes(`@packages/${oldName}`)) continue;

      const hunks = [];
      specifierRegex.lastIndex = 0;
      let match;
      while ((match = specifierRegex.exec(content))) {
        const [full, prefix, quote, subpath = ''] = match;
        const line = content.slice(0, match.index).split('\n').length;
        hunks.push({ line, before: full, after: `${prefix}${quote}@packages/${newName}${subpath}${quote}` });
      }
      if (hunks.length === 0) continue;

      specifierRegex.lastIndex = 0;
      const next = content.replace(
        specifierRegex,
        (_m, prefix, quote, subpath = '') => `${prefix}${quote}@packages/${newName}${subpath}${quote}`,
      );

      result.push({
        absPath: file,
        relPosix: path.relative(root, file).split(path.sep).join('/'),
        next,
        hunks,
      });
    }
  }

  return result;
}

/**
 * Пишет на диск замены, посчитанные scanImportUsages — отдельный шаг,
 * вызывается только после явного подтверждения пользователем превью.
 * @param {ReturnType<typeof scanImportUsages>} usages
 * @returns {string[]} relPosix изменённых файлов
 */
function applyImportUsages(usages) {
  for (const usage of usages) fs.writeFileSync(usage.absPath, usage.next);
  return usages.map((u) => u.relPosix);
}

/**
 * Печатает превью найденных импортов (файл + строка + before → after) и,
 * если пользователь подтвердил (или передан --yes), применяет замену.
 * @param {string} root
 * @param {string} oldName
 * @param {string} newName
 * @param {{ yes: boolean }} opts
 * @returns {Promise<string[]>} relPosix изменённых файлов
 */
async function reviewAndApplyImportRename(root, oldName, newName, { yes }) {
  const usages = scanImportUsages(root, oldName, newName);
  if (usages.length === 0) {
    console.log(`   Импортов "@packages/${oldName}" в apps/*, packages/* не найдено.`);
    return [];
  }

  console.log(`\n✏️  Найдены импорты "@packages/${oldName}" в ${usages.length} файле(ах):`);
  for (const usage of usages) {
    console.log(`   ${usage.relPosix}`);
    for (const hunk of usage.hunks) {
      console.log(`     :${hunk.line}  ${hunk.before}  →  ${hunk.after}`);
    }
  }
  console.log(
    '   Regex по apps/*, packages/* (не tools/, не AST) — динамические спецификаторы' +
      ' (шаблонные строки) не ловит, проверь сборкой/тайпчеком после применения.',
  );

  let proceed = yes;
  if (!proceed) {
    const { confirm } = await loadPrompts();
    proceed = await confirm({ message: 'Переписать эти импорты?', default: false });
  }
  if (!proceed) {
    console.log('   Импорты не тронуты — обнови вручную.');
    return [];
  }

  const updated = applyImportUsages(usages);
  console.log(`✅ Импорты обновлены в ${updated.length} файле(ах).`);
  return updated;
}

/**
 * Меняет "@packages/<old>": "workspace:*" на "@packages/<new>": "workspace:*"
 * (та же запись, любая версия/протокол сохраняется как есть) у всех
 * потребителей (apps/* и остальных packages/*) — та же логика обхода, что
 * removePackageReferences в remove-package.js, но замена ключа вместо
 * удаления. Импорты в исходном коде (import ... from "@packages/<old>")
 * этим не трогаются — как и при remove:package, это уже руками: искать и
 * заменять строки импортов автоматически рискованно (совпадения в
 * комментариях/строках), а обычный grep по репозиторию находит их быстро
 * и безопасно.
 * @param {string} root
 * @param {string} oldName
 * @param {string} newName
 * @returns {string[]} relPosix тех, у кого реально была ссылка
 */
function renamePackageReferences(root, oldName, newName) {
  const oldFullName = `@packages/${oldName}`;
  const newFullName = `@packages/${newName}`;
  const members = [...layout.listApps(root), ...layout.listPackages(root)];
  const updated = [];

  for (const member of members) {
    const pkgJsonPath = path.join(member.absDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    let changed = false;
    for (const field of ['dependencies', 'devDependencies']) {
      if (pkgJson[field]?.[oldFullName]) {
        pkgJson[field][newFullName] = pkgJson[field][oldFullName];
        delete pkgJson[field][oldFullName];
        changed = true;
      }
    }
    if (!changed) continue;

    fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
    updated.push(member.relPosix);
  }

  return updated;
}

/**
 * Переименовывает packages/<old> → packages/<new>: саму папку, "name" в её
 * package.json и ссылки у всех потребителей.
 * @param {string} root
 * @param {{ name: string, absDir: string, relPosix: string }} pkg
 * @param {string} newName
 */
function renamePackage(root, pkg, newName) {
  const newDir = path.join(root, layout.PACKAGES_REL, newName);
  if (fs.existsSync(newDir)) {
    throw new Error(`Пакет "${newName}" уже существует`);
  }

  fs.renameSync(pkg.absDir, newDir);

  const pkgJsonPath = path.join(newDir, 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  pkgJson.name = `@packages/${newName}`;
  fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);

  const updatedConsumers = renamePackageReferences(root, pkg.name, newName);

  console.log(`✅ ${pkg.relPosix} → packages/${newName}`);
  if (updatedConsumers.length > 0) {
    console.log('🔗 Обновлены ссылки в package.json:');
    updatedConsumers.forEach((rel) => console.log(`   ${rel}`));
  }

  return { relPosix: `packages/${newName}`, updatedConsumers };
}

async function maybeInstall(root, shouldInstall) {
  if (!shouldInstall) {
    console.log('\n⏭️  Пропущена установка. Вручную: pnpm install');
    return;
  }
  console.log('\n📦 pnpm install...');
  try {
    execSync('pnpm install', { stdio: 'inherit', cwd: root });
    console.log('\n✅ Готово');
  } catch {
    console.warn('\n⚠️  Установите вручную: pnpm install');
  }
}

async function namedFlow(root, cli) {
  const pkg = layout.listPackages(root).find((p) => p.name === cli.oldName);
  if (!pkg) {
    console.error(`❌ Пакет "${cli.oldName}" не найден`);
    process.exit(1);
  }
  if (!validateName(cli.newName)) {
    console.error('❌ Название: только a-z, 0-9, -');
    process.exit(1);
  }
  if (cli.newName === cli.oldName) {
    console.error('❌ Новое название совпадает со старым');
    process.exit(1);
  }

  if (!cli.yes) {
    const { confirm } = await loadPrompts();
    const proceed = await confirm({
      message: `Переименовать ${pkg.relPosix} → packages/${cli.newName}?`,
      default: false,
    });
    if (!proceed) {
      console.log('Отменено');
      return;
    }
  }

  const oldName = pkg.name;
  renamePackage(root, pkg, cli.newName);
  await reviewAndApplyImportRename(root, oldName, cli.newName, { yes: cli.yes });
  await maybeInstall(root, !cli.noInstall);
}

async function interactiveFlow(root) {
  const packages = layout.listPackages(root);
  if (packages.length === 0) {
    console.log('Нет ни одного пакета для переименования.');
    return;
  }

  const { select, input, confirm } = await loadPrompts();

  console.log('\n✏️  Переименование пакета\n');
  const pkg = await select({
    message: 'Какой пакет переименовать',
    choices: packages.map((p) => ({ name: p.relPosix, value: p })),
  });

  const newName = await input({
    message: 'Новое название',
    default: pkg.name,
    validate: (value) => {
      const trimmed = value.trim();
      if (!validateName(trimmed)) return 'Только a-z, 0-9, -';
      if (trimmed === pkg.name) return 'Совпадает с текущим названием';
      if (packages.some((p) => p.name === trimmed)) return `Пакет "${trimmed}" уже существует`;
      return true;
    },
  });

  const trimmedName = newName.trim();
  const proceed = await confirm({
    message: `Переименовать ${pkg.relPosix} → packages/${trimmedName}?`,
    default: false,
  });
  if (!proceed) {
    console.log('Отменено');
    return;
  }

  const oldName = pkg.name;
  renamePackage(root, pkg, trimmedName);
  await reviewAndApplyImportRename(root, oldName, trimmedName, { yes: false });
  const shouldInstall = await confirm({ message: 'Установить зависимости заново?', default: true });
  await maybeInstall(root, shouldInstall);
}

async function run() {
  const root = layout.findMonorepoRoot();
  let cli;
  try {
    cli = parseArgv(process.argv.slice(2));
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  if (cli.help) {
    console.log(
      'Использование: pnpm run rename:package -- <old-name> <new-name> [--no-install] [--yes]\n\n' +
        'Переименовывает packages/<old> → packages/<new>: папку, "name" в package.json и\n' +
        '"@packages/<old>": "workspace:*" у всех потребителей (apps/*, packages/*). Затем ищет\n' +
        'импорты (from/import/require) на "@packages/<old>" в apps/*, packages/* (не в tools/ —\n' +
        'там могут быть шаблоны генераторов, а не реальные импорты) и показывает превью правок\n' +
        'построчно — переписывает только после подтверждения (или сразу с --yes).\n' +
        'Без аргументов — интерактивный выбор пакета и ввод нового названия.\n\n' +
        'Примеры:\n' +
        '  pnpm run rename:package -- shared common\n' +
        '  pnpm run rename:package -- shared common --yes\n',
    );
    process.exit(0);
  }

  if (cli.oldName && cli.newName) {
    await namedFlow(root, cli);
    return;
  }

  if (cli.oldName || cli.newName) {
    console.error(
      '❌ Нужны оба аргумента: <old-name> <new-name> (или ни одного — для интерактивного режима)',
    );
    process.exit(1);
  }

  await interactiveFlow(root);
}

module.exports = { renamePackage };

if (require.main === module) {
  run().catch((err) => {
    if (err?.name === 'ExitPromptError') {
      console.log('\nОтменено');
      process.exit(0);
    }
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  });
}
