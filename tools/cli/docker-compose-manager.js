#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, execSync } = require('child_process');
const { parseDockerCompose } = require('../lib/docker-compose-parser');
const { findMonorepoRoot } = require('../lib/monorepo-layout');

/**
 * Простой спиннер на `readline.cursorTo`/`clearLine` (статичные функции
 * модуля, не `readline.createInterface` — не создают listener на stdin,
 * поэтому не конфликтуют с @inquirer/prompts, который управляет stdin сам).
 * @param {string} text
 * @returns {() => void} остановить и стереть строку
 */
function startSpinner(text) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  process.stdout.write(`${frames[0]} ${text}`);
  const timer = setInterval(() => {
    i = (i + 1) % frames.length;
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`${frames[i]} ${text}`);
  }, 80);
  return () => {
    clearInterval(timer);
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
  };
}

/**
 * `@inquirer/prompts` — ESM-only с v8 (проверено — `require()` из этого
 * CommonJS-файла упал бы с ERR_REQUIRE_ESM), поэтому грузится через
 * динамический `import()` — стандартный мост ESM→CJS в Node, не требует
 * переводить весь файл/tools/ в ESM.
 * @returns {Promise<{ checkbox: Function, select: Function }>}
 */
function loadPrompts() {
  return import('@inquirer/prompts');
}

/**
 * Статус контейнеров через `docker compose ps --format json` — Service/State
 * (реальные поля этого формата, проверено живьём на Docker Compose v5.3.1).
 * @param {string} monorepoRoot
 * @returns {Record<string, string>} serviceName -> state ('running', 'exited', ...)
 */
function getContainerStatuses(monorepoRoot) {
  const statusMap = {};
  try {
    const output = execSync('docker compose ps --format json', {
      encoding: 'utf8',
      cwd: monorepoRoot,
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000,
    });
    for (const line of output.trim().split('\n')) {
      if (!line.trim()) continue;
      const container = JSON.parse(line);
      statusMap[container.Service] = container.State;
    }
  } catch {
    // docker compose ps падает, если демон недоступен или ничего не поднято —
    // в обоих случаях корректно считать все сервисы остановленными.
  }
  return statusMap;
}

/**
 * Per-service build-инфо (context/dockerfile) через `docker compose config
 * --format json` — не ручной путь apps/<name>/Dockerfile, чтобы не
 * дублировать то, что уже разрешено в docker-compose.yml.
 * @param {string} monorepoRoot
 * @returns {Record<string, { context: string, dockerfile: string }>}
 */
function getComposeBuilds(monorepoRoot) {
  try {
    const output = execSync('docker compose config --format json', {
      encoding: 'utf8',
      cwd: monorepoRoot,
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000,
    });
    const data = JSON.parse(output);
    const builds = {};
    for (const [name, svc] of Object.entries(data.services || {})) {
      if (svc.build) builds[name] = svc.build;
    }
    return builds;
  } catch {
    return {};
  }
}

/**
 * Разбирает `--progress=rawjson` (пишется в stderr `docker build`, проверено
 * живьём) и определяет, был ли ПОЛНОСТЬЮ закэширован последний шаг стадии
 * stageName (по имени вида "[stageName N/N]"). У каждого vertex BuildKit в
 * cache-key входят digest'ы предыдущих шагов — если изменилось любое
 * upstream-COPY (исходники app'а ИЛИ отфильтрованные resolver'ом packages/*),
 * последний шаг стадии тоже перестаёт быть cached, поэтому проверять каждый
 * COPY по отдельности не нужно (проверено живьём).
 * @param {string} rawjson
 * @param {string} stageName
 * @returns {boolean|null} true — стадия полностью из кэша (ничего не менялось),
 *   false — что-то изменилось, null — не удалось разобрать вывод
 */
function isStageFullyCached(rawjson, stageName) {
  const vertices = new Map();
  for (const line of rawjson.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    for (const v of event.vertexes || []) {
      if (!v.digest || !v.name) continue;
      vertices.set(v.digest, { ...(vertices.get(v.digest) || {}), ...v });
    }
  }

  const stepRe = new RegExp(`^\\[${stageName} (\\d+)/(\\d+)\\]`);
  let lastStep = null;
  for (const v of vertices.values()) {
    const m = v.name.match(stepRe);
    if (!m) continue;
    if (m[1] === m[2]) lastStep = v;
  }

  if (!lastStep) return null;
  return Boolean(lastStep.cached);
}

/**
 * Актуальность сервиса — реальный `docker build --target freshness
 * --progress=rawjson`, БЕЗ тега (без `-t`) — канонический `<project>-<service>`
 * тег не трогается вообще, даже случайно. Стадия `freshness` (генераторы
 * tools/generators/nest|vite/dockerfile.js) останавливается сразу после COPY
 * исходников app'а и отфильтрованных resolver'ом packages/*, ДО дорогого
 * `pnpm install`/`build` — проверка дешёвая (доли секунды при полном кэше).
 * @param {string} monorepoRoot
 * @param {{ context: string, dockerfile: string }} [build]
 * @returns {Promise<{ ok: boolean, changed: boolean|null }>}
 */
function checkServiceFreshness(monorepoRoot, build) {
  if (!build) return Promise.resolve({ ok: false, changed: null });

  return new Promise((resolve) => {
    const args = [
      'build', '--target', 'freshness',
      '-f', build.dockerfile, '--progress=rawjson', build.context,
    ];
    const child = spawn('docker', args, { cwd: monorepoRoot });

    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', () => resolve({ ok: false, changed: null }));
    child.on('exit', (code) => {
      if (code !== 0) return resolve({ ok: false, changed: null });
      const cached = isStageFullyCached(stderr, 'freshness');
      resolve({ ok: true, changed: cached === null ? null : !cached });
    });
  });
}

/**
 * @param {string} monorepoRoot
 * @param {Record<string, { context: string, dockerfile: string }>} builds
 * @returns {Promise<Record<string, { ok: boolean, changed: boolean|null }>>}
 */
async function checkAllFreshness(monorepoRoot, builds) {
  const names = Object.keys(builds);
  const results = await Promise.all(names.map((name) => checkServiceFreshness(monorepoRoot, builds[name])));
  const map = {};
  names.forEach((name, i) => { map[name] = results[i]; });
  return map;
}

/**
 * @param {{ ok: boolean, changed: boolean|null }|undefined} result
 *   undefined — проверка не запускалась (сервис без build-секции, или check пропущен)
 */
function formatFreshness(result) {
  if (!result) return '—';
  if (!result.ok) return '✗ ошибка проверки';
  if (result.changed === null) return '? не определено';
  return result.changed ? '⟳ есть изменения' : '✓ актуален';
}

/**
 * Форматирует статус для отображения
 */
function formatStatus(status) {
  if (!status || status === 'unknown') {
    return '○ остановлен';
  }

  const statusLower = status.toLowerCase();

  if (statusLower.includes('running') || statusLower === 'up') {
    return '✓ запущен';
  } else if (statusLower.includes('exited') || statusLower === 'stopped') {
    return '✗ остановлен';
  } else if (statusLower.includes('restarting')) {
    return '↻ перезапуск';
  } else if (statusLower.includes('paused')) {
    return '⏸ приостановлен';
  } else if (statusLower.includes('dead')) {
    return '✕ мертв';
  } else {
    return `○ ${status}`;
  }
}

/**
 * Извлекает порты из конфигурации сервиса
 */
function getServicePorts(serviceConfig) {
  if (!serviceConfig || !serviceConfig.ports) {
    return '-';
  }

  const ports = serviceConfig.ports;
  const portStrings = [];

  if (Array.isArray(ports)) {
    ports.forEach(port => {
      if (typeof port === 'string') {
        // Формат "host:container" или "host:container/protocol"
        const portPart = port.split('/')[0];
        const hostPort = portPart.split(':')[0];
        portStrings.push(hostPort);
      } else if (typeof port === 'object' && port.published) {
        // Формат объекта { published: 4444, target: 4444 }
        portStrings.push(port.published.toString());
      }
    });
  }

  return portStrings.length > 0 ? portStrings.join(', ') : '-';
}

/**
 * Запускает docker compose команду
 * @param {string[]} serviceNames
 * @param {string} target
 * @param {string} monorepoRoot
 */
function runDockerCompose(serviceNames, target, monorepoRoot) {
  const args = ['compose', 'up', '--build'];

  // Для development добавляем флаг --watch
  if (target === 'development') {
    args.push('--watch');
  }

  // Добавляем имена сервисов если они указаны
  if (serviceNames.length > 0) {
    args.push(...serviceNames);
  }

  console.log('\n🚀 Запускаю команду:');
  const watchFlag = target === 'development' ? '--watch ' : '';
  const command = `cross-env DOCKER_TARGET=${target} docker compose up --build ${watchFlag}${serviceNames.length > 0 ? serviceNames.join(' ') : ''}`.trim();
  console.log(`   ${command}\n`);

  // Используем cross-env для Windows совместимости
  const child = spawn('cross-env', [
    `DOCKER_TARGET=${target}`,
    'docker',
    ...args
  ], {
    stdio: 'inherit',
    shell: true,
    cwd: monorepoRoot,
  });

  child.on('error', (error) => {
    console.error(`\n❌ Ошибка при запуске команды: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

/**
 * Главная функция
 */
async function manageDockerCompose() {
  console.log('🐳 Docker Compose Manager\n');

  let monorepoRoot;
  try {
    monorepoRoot = findMonorepoRoot();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  const composePath = path.join(monorepoRoot, 'docker-compose.yml');

  if (!fs.existsSync(composePath)) {
    console.error(`❌ Файл docker-compose.yml не найден в ${monorepoRoot}`);
    console.log('💡 Создайте docker-compose.yml или запустите: pnpm run docker:create-compose');
    process.exit(1);
  }

  // Парсим docker-compose.yml
  let compose;
  try {
    compose = parseDockerCompose(composePath);
  } catch (error) {
    console.error(`❌ Ошибка при парсинге docker-compose.yml: ${error.message}`);
    process.exit(1);
  }

  const services = compose.services || {};
  const serviceNames = Object.keys(services);

  if (serviceNames.length === 0) {
    console.error('❌ В docker-compose.yml не найдено сервисов');
    process.exit(1);
  }

  const { checkbox, select } = await loadPrompts();

  // Статус контейнеров — read-only, без побочных эффектов.
  const statuses = getContainerStatuses(monorepoRoot);

  // Актуальность — реально запускает docker build (до дешёвой стадии
  // freshness, без install/build, без тега — образы не трогает), но это уже
  // не спрашивается отдельно: проверка идёт всегда, только со спиннером,
  // раз сама по себе она дешёвая и не имеет опасных побочных эффектов.
  const stopSpinner = startSpinner('Проверяю актуальность образов (docker build --target freshness)...');
  const builds = getComposeBuilds(monorepoRoot);
  const freshness = await checkAllFreshness(monorepoRoot, builds);
  stopSpinner();

  // Список сервисов виден ДО выбора стратегии — при "Все"/"Все неактуальные"
  // чекбокс ниже вообще не откроется, значит это единственное место, где
  // статус/актуальность/порты вообще показываются.
  console.log('📋 Сервисы:');
  serviceNames.forEach((name) => {
    console.log(`   ${name}  [${formatStatus(statuses[name] || 'unknown')}, ${formatFreshness(freshness[name])}, порты: ${getServicePorts(services[name])}]`);
  });
  console.log();

  // Стратегия выбора — отдельным select() перед возможным checkbox: у
  // @inquirer/checkbox нет API для кастомных хоткеев (только remap
  // встроенных all/invert, проверено), поэтому "выбрать все неактуальные"
  // сделан отдельным пунктом, а не хоткеем внутри самого чекбокса.
  const staleCount = serviceNames.filter((name) => freshness[name]?.changed).length;
  const selectionMode = await select({
    message: 'Какие сервисы запустить?',
    choices: [
      { name: 'Ручной выбор', value: 'manual' },
      {
        name: 'Все неактуальные',
        value: 'stale',
        disabled: staleCount === 0 ? '(нет неактуальных)' : false,
      },
      { name: 'Все', value: 'all' },
    ],
  });

  let selectedServices;
  if (selectionMode === 'all') {
    selectedServices = serviceNames;
  } else if (selectionMode === 'stale') {
    selectedServices = serviceNames.filter((name) => freshness[name]?.changed);
  } else {
    // Ничего не предвыбрано намеренно — явный выбор, не "снять лишнее".
    selectedServices = await checkbox({
      message: 'Выберите сервисы',
      choices: serviceNames.map((name) => ({
        name: `${name}  [${formatStatus(statuses[name] || 'unknown')}, ${formatFreshness(freshness[name])}, порты: ${getServicePorts(services[name])}]`,
        value: name,
      })),
      // Дефолт склеивает весь декорированный name (со статусом/портами в
      // скобках) через запятую — после подтверждения нужны только сами имена.
      theme: {
        style: {
          renderSelectedChoices: (selected) => selected.map((c) => c.value).join(', '),
        },
      },
    });
  }

  if (selectedServices.length === 0) {
    console.error('❌ Не выбрано ни одного сервиса (при "Все неактуальные" — возможно, все сервисы уже актуальны)');
    process.exit(1);
  }

  // Выбор target
  const target = await select({
    message: 'Выберите target',
    choices: [
      { name: 'development (dev)', value: 'development' },
      { name: 'production (prod)', value: 'production' },
    ],
  });

  console.log(`\n📌 Target: ${target}`);

  // Запускаем команду
  runDockerCompose(selectedServices, target, monorepoRoot);
}

// Запуск
if (require.main === module) {
  manageDockerCompose().catch(err => {
    // Ctrl+C в @inquirer/prompts бросает ExitPromptError — это штатная отмена
    // пользователем, не ошибка, выходим тихо без стектрейса.
    if (err?.name === 'ExitPromptError') {
      console.log('\nОтменено');
      process.exit(0);
    }
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  });
}
