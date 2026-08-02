#!/usr/bin/env node
'use strict';

const { readdirSync, existsSync, realpathSync, readFileSync } = require('node:fs');
const path = require('node:path');
// cross-spawn вместо node:child_process.spawn/spawnSync с shell: true — сам
// резолвит .cmd/.bat-обёртки на Windows и правильно экранирует аргументы,
// без реального шелла между нами и командой. shell: true + args-массив у
// голого child_process — источник DEP0190 (аргументы конкатенируются, а не
// экранируются) и самого источника багов, которые cross-spawn специально
// существует, чтобы обойти.
const crossSpawn = require('cross-spawn');
const chokidar = require('chokidar');
const dotenv = require('dotenv');
const treeKill = require('tree-kill');
const { z } = require('zod');
const { require: tsxRequire } = require('tsx/cjs/api');

const ENV_FILE_NAME = '.env';
const ENV_DECLARATION_NAME = 'env.ts';

/**
 * Контракт `.env` / `env.ts` для одной директории (app или пакет). Имя
 * `env.ts`, а не `.env.ts` — специально: голый импорт `./.env` в webpack
 * резолвится в первую очередь на реальный файл `.env` (точное совпадение
 * имени побеждает раньше, чем резолвер попробует добавить `.ts`), так что
 * `.env.ts` физически не импортируется из TS-кода, лежащего рядом с `.env`.
 *
 *  - ни того, ни другого        → не участвует в workspace-env вообще, пропуск
 *  - только `env.ts`            → OK, значения ожидаются из process.env
 *    напрямую (Docker/оркестратор), локальных нет — просто регистрируем со
 *    пустым набором файловых переменных
 *  - `.env` без `env.ts`        → ОШИБКА: непровалидированные значения без
 *    объявленной схемы — так делать нельзя
 *  - и то, и другое             → OK, обычный случай
 */
function addEntryIfNeeded(folderName, dir, collected, errors) {
  const envPath = path.join(dir, ENV_FILE_NAME);
  const envTsPath = path.join(dir, ENV_DECLARATION_NAME);
  const hasEnvFile = existsSync(envPath);
  const hasEnvTs = existsSync(envTsPath);

  if (!hasEnvFile && !hasEnvTs) return;

  if (hasEnvFile && !hasEnvTs) {
    errors.push(`"${folderName}" содержит .env без env.ts — заведите декларацию схемы рядом с .env`);
    return;
  }

  const variables = hasEnvFile ? dotenv.parse(readFileSync(envPath)) : {};
  collected.push({ folderName, variables, envTsPath, envPath: hasEnvFile ? envPath : undefined });
}

/**
 * Рекурсивно обходит `node_modules/@packages` этого app'а — то есть ровно те
 * пакеты, что реально объявлены зависимостями и установлены pnpm, а не все
 * `packages/*` монорепы вслепую — и для каждого найденного пакета заходит
 * ещё и в его собственный `node_modules/@packages` (транзитивные зависимости
 * пакетов друг от друга: `app -> db -> logger` и т.п.). Каждый физический
 * пакет (по `realpath`) обрабатывается ровно один раз — защита от циклов и
 * от повторной обработки одного пакета, до которого дошли двумя путями.
 *
 * Каждую реально существующую `node_modules/@packages`-директорию (у app'а и
 * у каждого найденного пакета) складывает в `scopeDirs` — это отдельные
 * точки, за появлением/исчезновением записей в которых потом следит
 * `--watch` (см. `setupWatcher`), чтобы заметить `pnpm add`/`pnpm remove`.
 */
function collectPackageEnvs(startDir, visited, collected, errors, scopeDirs) {
  const scopeDir = path.join(startDir, 'node_modules', '@packages');
  if (!existsSync(scopeDir)) return;
  scopeDirs.push(scopeDir);

  for (const name of readdirSync(scopeDir)) {
    const real = realpathSync(path.join(scopeDir, name));
    if (visited.has(real)) continue;
    // Пакет запоминаем в visited (→ станет packageDirs) даже если у него
    // сейчас нет ни .env, ни env.ts — иначе появление того или другого
    // позже, во время --watch, некому будет заметить: следить начинаем за
    // самой директорией пакета, а не только за уже существующими файлами.
    visited.add(real);

    addEntryIfNeeded(name, real, collected, errors);
    collectPackageEnvs(real, visited, collected, errors, scopeDirs);
  }
}

/**
 * Одинаковое имя переменной в `.env` двух разных пакетов (или app'а и
 * пакета) — запрещено: никакого авто-namespace/префикса тут нет, коллизия
 * имён — это ошибка конфигурации, которую нужно решить руками (переименовать
 * одну из переменных), а не скрывать магией. Каждая запись в `collected` —
 * заведомо отдельный физический пакет/app, так что повторное имя ключа —
 * всегда коллизия.
 */
function findNameCollisions(collected) {
  const ownerOf = new Map();
  const errors = [];

  for (const { folderName, variables } of collected) {
    for (const key of Object.keys(variables)) {
      const owner = ownerOf.get(key);
      if (owner) {
        errors.push(`"${key}" объявлена и в "${owner}", и в "${folderName}"`);
      } else {
        ownerOf.set(key, folderName);
      }
    }
  }

  return errors;
}

/**
 * `tsxRequire` кэширует по пути файла — повторный вызов для того же пути
 * внутри одного процесса вернёт СТАРЫЙ модуль, даже если файл на диске уже
 * изменился (проверено вживую). В `--watch` этот процесс живёт долго,
 * поэтому перед каждым `tsxRequire` схемы явно сбрасываем кэш этого файла.
 *
 * Через `tsxRequire.resolve()` + `tsxRequire.cache` — оба задокументированы
 * в типах `tsx/cjs/api` (`index.d.cts`), а не через ручной перебор
 * `require.cache` по угаданному формату ключа: `resolve()` сам знает
 * актуальный формат ключа этой версии `tsx` (сейчас он добавляет свой
 * `?namespace=...` суффикс к пути) — если формат сменится в будущей версии,
 * код не сломается молча.
 */
function invalidateTsxCache(filePath) {
  const resolved = tsxRequire.resolve(filePath, __filename);
  delete tsxRequire.cache[resolved];
}

/**
 * Компактный вывод для `--debug`: без `console.table` (у него всегда есть
 * колонка `(index)`, убрать нельзя) и без повторяющейся колонки `package` —
 * имя пакета выводится один раз заголовком, дальше просто `KEY = value`,
 * выровненные по самому длинному имени переменной внутри группы.
 */
function printTableGroups(groups) {
  for (const { folderName, values } of groups) {
    console.log(`${folderName}:`);
    const keyWidth = Math.max(...Object.keys(values).map((k) => k.length));
    for (const [key, value] of Object.entries(values)) {
      console.log(`  ${key.padEnd(keyWidth)} = ${value}`);
    }
  }
}

/**
 * status/code === null значит, что процесс убит сигналом (или не смог
 * запуститься) — а не "успешно завершился с кодом 0", как подсказывает
 * наивный `?? 0`. Иначе CI/скрипты, проверяющие exit code, увидят "успех"
 * там, где процесс на самом деле был убит. Общая логика для обеих веток —
 * синхронного `spawnSync` и `exit`-события дочернего процесса в `--watch`.
 */
function exitCodeFor(status, signal) {
  return status ?? (signal ? 1 : 0);
}

// Флаги — только в начале, до самой команды: иначе не отличить от флагов
// дочерней команды (например `--watch` у nest start).
//   workspace-env --debug --watch --set NODE_ENV=development nest start --watch
//
// --set KEY=value (повторяемый) — разовый ad-hoc оверрайд process.env для
// ЭТОГО конкретного запуска, в духе cross-env (которого раньше приходилось
// отдельно вызывать в цепочке ради кросс-платформенного `KEY=value command`
// — на Windows это не нативный shell-синтаксис). Осознанно ОТДЕЛЬНЫЙ от
// .env/env.ts путь: те — декларативные, закоммиченные, провалидированные
// схемой; --set — ничем не валидируется, просто пробрасывается как есть,
// как и было у cross-env. Применяется сразу, до первого runCycle() — так
// его значения уже видны схеме env.ts при валидации (см. process.env[key] =
// value ниже), а не только реальной дочерней команде.
let debugMode = false;
let watchMode = false;
const setOverrides = [];
let cliArgs = process.argv.slice(2);
while (true) {
  if (cliArgs[0] === '--debug') {
    debugMode = true;
    cliArgs = cliArgs.slice(1);
    continue;
  }
  if (cliArgs[0] === '--watch') {
    watchMode = true;
    cliArgs = cliArgs.slice(1);
    continue;
  }
  if (cliArgs[0] === '--set') {
    const pair = cliArgs[1];
    const eqIndex = pair ? pair.indexOf('=') : -1;
    if (eqIndex <= 0) {
      console.error('workspace-env: --set требует аргумент вида KEY=value');
      process.exit(1);
    }
    setOverrides.push([pair.slice(0, eqIndex), pair.slice(eqIndex + 1)]);
    cliArgs = cliArgs.slice(2);
    continue;
  }
  break;
}
for (const [key, value] of setOverrides) {
  process.env[key] = value;
}

// cwd, а не __dirname: этот файл вызывается через bin-симлинк из
// node_modules/.bin/workspace-env, физически лежит внутри пакета
// @tools/workspace-env, а не рядом с app'ом. pnpm/npm запускают package.json
// scripts с cwd = директория того package.json, чей скрипт выполняется — то
// есть корень вызывающего app'а (что локально, что в Docker с его WORKDIR).
const appRoot = process.cwd();
// define-env.ts напрямую, не через index.ts — package.json#exports тоже
// резолвит node-вариант прямо сюда (см. define-env.ts про самодостаточность
// без внутренних relative-импортов).
const workspaceEnvIndexPath = path.join(__dirname, '..', 'src', 'define-env.ts');
const { ENV_SCHEMA } = tsxRequire(workspaceEnvIndexPath, __filename);

// Ключи, которые заинжектили мы сами — при перезагрузке (--watch) их можно
// смело перезаписывать свежим содержимым файла (мы точно знаем, что именно
// его сейчас поменяли). Любой другой уже стоящий в process.env ключ (реальный
// OS/Docker env, до которого workspace-env не дотрагивался) — не трогаем.
const injectedKeys = new Set();

/**
 * Один полный проход: собрать `.env`/`env.ts`, проверить структуру и
 * коллизии, заинжектить в process.env, провалидировать схемами. Возвращает
 * `{ ok, collected, scopeDirs, packageDirs }` вместо `process.exit` —
 * вызывающий код сам решает: при первом прогоне упасть совсем, при повторном
 * (в `--watch`) — просто не перезапускать дочерний процесс с плохим `.env`.
 *
 * `packageDirs` — app root + директория каждого найденного пакета
 * (включая те, что сейчас без `.env`/`env.ts` вовсе) — источник для
 * `setupWatcher`, чтобы заметить появление/удаление самих этих файлов, а не
 * только правку уже существующих.
 */
function runCycle() {
  const visited = new Set();
  const collected = [];
  const structureErrors = [];
  const scopeDirs = [];

  // packageDirs пересчитывается из visited на каждый вызов (а не сохраняется
  // один раз) — так cycleResult корректен и в catch-ветке, где visited может
  // быть заполнен лишь частично (обход прервался на середине).
  function cycleResult(ok) {
    return { ok, collected, scopeDirs, packageDirs: [appRoot, ...visited] };
  }
  function fail(message) {
    console.error(message);
    return cycleResult(false);
  }

  try {
    addEntryIfNeeded(path.basename(appRoot), appRoot, collected, structureErrors);
    collectPackageEnvs(appRoot, visited, collected, structureErrors, scopeDirs);
  } catch (e) {
    // node_modules/@packages может быть застигнут в промежуточном состоянии
    // прямо во время pnpm add/remove: pnpm перелинковывает все записи разом
    // (не только изменившуюся), так что readdirSync успевает увидеть запись,
    // которую realpathSync уже не находит (ENOENT/ENOTDIR) — проверено
    // вживую. Ловим только эти конкретные, ожидаемые коды гонки с внешним
    // процессом — цикл просто невалиден в этот момент, повторная попытка
    // случится на следующем fs-событии (pnpm обычно досылает ещё одно после
    // стабилизации). Любую другую ошибку (баг в самом коде, а не гонка с
    // pnpm) пробрасываем дальше — маскировать её под "идёт pnpm install"
    // неправильно и молча скроет реальную поломку.
    if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e;
    return fail(`Не удалось прочитать node_modules/@packages (похоже, сейчас идёт pnpm install) — попробую снова при следующем изменении: ${e.message}`);
  }

  if (structureErrors.length > 0) {
    return fail('Ошибка структуры .env/env.ts:\n' + structureErrors.join('\n'));
  }

  const collisions = findNameCollisions(collected);
  if (collisions.length > 0) {
    return fail('Коллизия имён переменных окружения между app и пакетами:\n' + collisions.join('\n'));
  }

  // Ключ, который мы сами заинжектили в прошлом цикле, но которого больше
  // нет ни в одном .env (переменную удалили/переименовали во время --watch),
  // не должен продолжать висеть в process.env призраком прошлого цикла —
  // иначе рестарт не эквивалентен свежему старту с текущим содержимым файлов.
  const currentFileKeys = new Set();
  for (const { variables } of collected) {
    for (const key of Object.keys(variables)) currentFileKeys.add(key);
  }
  for (const key of injectedKeys) {
    if (!currentFileKeys.has(key)) {
      delete process.env[key];
      injectedKeys.delete(key);
    }
  }

  for (const { variables } of collected) {
    for (const [key, value] of Object.entries(variables)) {
      if (injectedKeys.has(key) || process.env[key] === undefined) {
        process.env[key] = value;
        injectedKeys.add(key);
      }
    }
  }

  const validationErrors = [];
  const tableGroups = [];
  for (const entry of collected) {
    invalidateTsxCache(entry.envTsPath);
    let mod;
    try {
      mod = tsxRequire(entry.envTsPath, __filename);
    } catch (e) {
      validationErrors.push(`[${entry.folderName}] не удалось загрузить env.ts: ${e.message}`);
      continue;
    }

    const schema = mod.default && mod.default[ENV_SCHEMA];
    if (!schema) {
      validationErrors.push(`[${entry.folderName}] env.ts должен делать "export default defineEnv(...)"`);
      continue;
    }

    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      validationErrors.push(`[${entry.folderName}]\n${z.prettifyError(parsed.error)}`);
      continue;
    }

    if (debugMode) {
      tableGroups.push({ folderName: entry.folderName, values: parsed.data });
    }
  }

  if (validationErrors.length > 0) {
    return fail('Невалидные переменные окружения:\n' + validationErrors.join('\n'));
  }

  if (debugMode) {
    console.log('workspace-env: итоговые переменные окружения');
    printTableGroups(tableGroups);
  }

  return cycleResult(true);
}

const [cmd, ...args] = cliArgs;

if (!watchMode) {
  const cycle = runCycle();
  if (!cycle.ok) process.exit(1);

  const result = crossSpawn.sync(cmd, args, { stdio: 'inherit', env: process.env });
  // result.error — spawnSync не смог запустить процесс вообще (например,
  // сам shell не найден); в этом случае result.status всегда null, и без
  // явной проверки пользователь увидел бы только голый "exit 1" без единой
  // подсказки, что именно пошло не так.
  if (result.error) {
    console.error(`Не удалось запустить "${cmd}": ${result.error.message}`);
    process.exit(1);
  }
  process.exit(exitCodeFor(result.status, result.signal));
} else {
  runWatchMode();
}

/**
 * Супервизор для `--watch`: после первого успешного прогона следит через
 * `chokidar` (надёжнее голого `fs.watch` — нормализует платформенные
 * особенности вроде дублирующихся событий и частичной записи;
 * `awaitWriteFinish` ждёт стабилизации размера файла вместо самодельного
 * debounce) за двумя видами директорий, обе — `depth: 0` (только
 * непосредственное содержимое, без рекурсии):
 *
 *  - `packageDirs` (app root + каждый найденный пакет, включая те, у
 *    которых сейчас нет ни `.env`, ни `env.ts`) — тут смотрим на
 *    появление/изменение/удаление файла с именем `.env` или `env.ts`
 *    непосредственно внутри;
 *  - `scopeDirs` (`node_modules/@packages` у app'а и у каждого пакета) —
 *    тут смотрим на появление/исчезновение ЛЮБОЙ записи вообще, это
 *    `pnpm add`/`pnpm remove` зависимости во время работающего `--watch`.
 *
 * При любой из этих правок — убивает текущий дочерний
 * процесс, заново собирает/проверяет/инжектит (с обязательным сбросом
 * `tsxRequire`-кэша, см. `invalidateTsxCache`) и поднимает его свежим. Если
 * новый прогон невалиден — печатает ошибку и оставляет старый (последний
 * рабочий) процесс жить, вместо того чтобы убивать рабочую сессию из-за
 * опечатки в `.env`/`env.ts`.
 *
 * Это единственное место в проекте, реагирующее на изменение `.env` — в
 * `webpack.config.js` специально убран `WatchEnvFilePlugin`, следивший за тем
 * же файлом: два независимых триггера рестарта одного и того же процесса на
 * одно и то же событие — гонка (та же причина, по которой раньше убрали
 * Turborepo).
 */
function runWatchMode() {
  const first = runCycle();
  if (!first.ok) process.exit(1);

  let child;
  let watcher;
  let restarting = false;
  let pendingRestart = false;

  function attachExitWatcher(proc) {
    proc.on('exit', (code, signal) => {
      // Рестарт сам убивает процесс — в этот момент restarting уже true,
      // и это ожидаемый exit, не "приложение упало само".
      if (!restarting) {
        closeWatcher();
        process.exit(exitCodeFor(code, signal));
      }
    });
  }

  function spawnChild() {
    const proc = crossSpawn(cmd, args, { stdio: 'inherit', env: process.env });
    // Без своего слушателя необработанное 'error' (например, сам shell не
    // нашёлся) — событие EventEmitter, для которого Node по умолчанию
    // бросает исключение и роняет весь супервизор, а не только дочерний
    // процесс.
    proc.on('error', (err) => {
      console.error(`Не удалось запустить "${cmd}": ${err.message}`);
    });
    attachExitWatcher(proc);
    return proc;
  }

  function closeWatcher() {
    if (watcher) watcher.close();
    watcher = undefined;
  }

  function setupWatcher(scopeDirs, packageDirs) {
    closeWatcher();
    const paths = [...new Set([...scopeDirs, ...packageDirs])];
    if (paths.length === 0) return;

    const scopeDirSet = new Set(scopeDirs);

    // Следим не за конкретными файлами .env/env.ts, а за самими
    // директориями (app root, каждый найденный пакет, включая те, у которых
    // сейчас нет ни .env, ни env.ts вовсе — и node_modules/@packages).
    // Если следить только за уже существующими файлами, то создание
    // .env/env.ts там, где их раньше не было, остаётся незамеченным —
    // следить за путём, которого ещё нет на диске, нечем. depth: 0
    // одинаково важен для обоих видов директорий: без него chokidar пошёл
    // бы рекурсивно по исходникам каждого пакета (для packageDirs) или по
    // символьным ссылкам внутрь них (для scopeDirs), а нас интересует
    // только их непосредственное содержимое.
    watcher = chokidar.watch(paths, {
      ignoreInitial: true,
      depth: 0,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    function handleFsEvent(changedPath) {
      const parent = path.dirname(changedPath);
      const base = path.basename(changedPath);
      if (scopeDirSet.has(parent)) {
        // Запись в node_modules/@packages появилась/пропала — pnpm add/remove.
        triggerRestart();
        return;
      }
      if (base === ENV_FILE_NAME || base === ENV_DECLARATION_NAME) {
        // .env/env.ts создан, изменён или удалён у app'а/пакета.
        triggerRestart();
      }
    }

    watcher.on('add', handleFsEvent);
    watcher.on('unlink', handleFsEvent);
    watcher.on('addDir', handleFsEvent);
    watcher.on('unlinkDir', handleFsEvent);
    watcher.on('change', handleFsEvent);
  }

  // Если правка пришла, пока предыдущий рестарт ещё не завершился (например,
  // сразу два .env поменялись почти одновременно) — не теряем событие, а
  // запоминаем и перезапускаем ещё раз сразу после текущего цикла.
  function triggerRestart() {
    if (restarting) {
      pendingRestart = true;
      return;
    }
    doRestart();
  }

  function doRestart() {
    restarting = true;
    console.log('workspace-env: изменился .env/env.ts, проверяю...');

    // Валидируем ДО того, как трогать текущий процесс: если новый .env/env.ts
    // невалиден, старый (последний рабочий) процесс продолжает жить как ни
    // в чём не бывало — падать в "ничего не запущено" из-за опечатки не надо.
    const cycle = runCycle();
    if (!cycle.ok) {
      console.error('workspace-env: новый .env/env.ts невалиден — текущий процесс продолжает работать со старыми значениями. Исправьте и сохраните заново.');
      finishRestart();
      return;
    }

    setupWatcher(cycle.scopeDirs, cycle.packageDirs);
    const oldChild = child;
    oldChild.once('exit', () => {
      child = spawnChild();
      finishRestart();
    });
    // treeKill, не oldChild.kill(): сам spawnChild() (даже без shell — теперь
    // через cross-spawn) убивает только НЕПОСРЕДСТВЕННОГО ребёнка, а
    // `nest start --watch`/vite сами порождают своих детей (webpack и т.п.) —
    // обычный kill() их не достаёт, остаются висеть сиротами.
    treeKill(oldChild.pid);
  }

  function finishRestart() {
    restarting = false;
    if (pendingRestart) {
      pendingRestart = false;
      triggerRestart();
    }
  }

  function shutdown() {
    closeWatcher();
    if (!child) {
      process.exit(0);
      return;
    }
    // Дожидаемся реального завершения дерева процессов, а не только факта
    // отправки сигнала: treeKill асинхронный (на Windows — отдельный
    // `taskkill`-процесс), и process.exit() до его завершения может убить
    // родителя раньше, чем taskkill вообще успеет отработать — те же
    // осиротевшие процессы, ради защиты от которых treeKill и был добавлен.
    treeKill(child.pid, () => process.exit(0));
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  setupWatcher(first.scopeDirs, first.packageDirs);
  child = spawnChild();
}
