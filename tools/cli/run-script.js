#!/usr/bin/env node

const { spawn } = require('child_process');
const layout = require('../lib/monorepo-layout');

/**
 * `@inquirer/prompts` — ESM-only с v8, грузится через динамический `import()`
 * — стандартный мост ESM→CJS в Node.
 * @returns {Promise<{ select: Function }>}
 */
function loadPrompts() {
  return import('@inquirer/prompts');
}

/**
 * @typedef {object} TaskDef
 * @property {boolean} allWhenEmpty  без имени: true → вся workspace сразу (pnpm -r), false → интерактивный выбор
 */
/** @type {Record<string, TaskDef>} */
const TASKS = {
  dev: { allWhenEmpty: false },
  build: { allWhenEmpty: true },
};

function printHelp(task) {
  console.log(`Использование: pnpm run ${task} [название]

Запускает "${task}" для приложения из apps/* напрямую через pnpm --filter —
без turbo. packages/* не требуют сборки (сырой TS, компилируется тем же
бандлером, что и само приложение), а dev-рестарт на их правки уже делает
webpack/Vite app'а сам — отдельный супервизор поверх только создавал гонку
(двойной рестарт одного процесса), поэтому убран.

${TASKS[task].allWhenEmpty
    ? `Без аргумента — "${task}" для всех apps/* сразу (pnpm -r run ${task}).`
    : 'Без аргумента — интерактивный выбор из списка apps/*.'}

Примеры:
  pnpm run ${task}
  pnpm run ${task} nest
`);
}

async function pickInteractive(apps, task) {
  const { select } = await loadPrompts();

  console.log(`\n🚀 Запуск ${task}\n`);
  return select({
    message: 'Приложение',
    choices: apps.map((a) => ({ name: `${a.relPosix} (${a.kind})`, value: a })),
  });
}

function runPnpm(root, command) {
  console.log(`\n▶️  ${command}\n`);
  // shell: true + одна строка (не массив args) — так же, как раньше с turbo:
  // на Windows pnpm резолвится как .cmd, spawn без shell его не запустит;
  // массив args с shell:true даёт deprecation warning про экранирование.
  const child = spawn(command, { stdio: 'inherit', shell: true, cwd: root });
  child.on('exit', (code) => process.exit(code ?? 0));
}

async function main() {
  const task = process.argv[2];
  if (!task || !TASKS[task]) {
    console.error(`❌ Неизвестная задача: ${task}. Ожидается: ${Object.keys(TASKS).join(' | ')}`);
    process.exit(1);
  }

  const argv = process.argv.slice(3).filter((a) => a !== '--');
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp(task);
    process.exit(0);
  }

  const root = layout.findMonorepoRoot();
  const apps = layout.listApps(root);
  const { allWhenEmpty } = TASKS[task];

  if (apps.length === 0) {
    console.error('❌ Нет ни одного приложения в apps/. Сначала pnpm run create:app');
    process.exit(1);
  }

  const nameArg = argv[0];
  if (nameArg) {
    const app = layout.findAppByName(nameArg, root);
    if (!app) {
      console.error(`❌ Приложение "${nameArg}" не найдено`);
      process.exit(1);
    }
    runPnpm(root, `pnpm --filter @${layout.APPS_REL}/${app.name} run ${task}`);
    return;
  }

  if (allWhenEmpty) {
    runPnpm(root, `pnpm -r run ${task}`);
    return;
  }

  const app = await pickInteractive(apps, task);
  runPnpm(root, `pnpm --filter @${layout.APPS_REL}/${app.name} run ${task}`);
}

main().catch((err) => {
  if (err?.name === 'ExitPromptError') {
    console.log('\nОтменено');
    process.exit(0);
  }
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});
