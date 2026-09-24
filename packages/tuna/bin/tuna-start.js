#!/usr/bin/env node

// Framework-agnostic обёртка над `tuna` (публичный dev-туннель): поднимает
// `tuna http <target> --domain=...` рядом с dev-командой и прибивает оба
// дерева процессов вместе. cross-spawn/tree-kill — тот же паттерн, что и в
// @tools/workspace-env (см. её bin/workspace-env.js): обычный child.kill()
// не достаёт до вложенных детей (vite/webpack и т.п.), остаются сироты.
const crossSpawn = require('cross-spawn');
const treeKill = require('tree-kill');
const net = require('node:net');
const https = require('node:https');

const HELP_TEXT = `tuna-start — framework-agnostic лаунчер туннеля \`tuna\`.

Использование:
  tuna-start [опции]                 только туннель (замена старого standalone "pnpm run tuna")
  tuna-start [опции] -- <команда...>  туннель + dev-команда рядом, оба дерева процессов
                                       прибиваются вместе (Ctrl+C, падение любого из них)

Опции:
  --target <template>   Явная цель для tuna вместо автодетекта. Плейсхолдеры
                         {ИМЯ} резолвятся из process.env.ИМЯ (регистр как у
                         самой переменной) — например "0.0.0.0:{PORT}".
  -h, --help             Показать эту справку и выйти.

Автодетект цели (когда --target не передан):
  1. Ждёт, пока PORT начнёт принимать TCP-соединения — без ограничения по
     времени (первые 60с молча, дальше раз в 10с предупреждение с числом
     попыток в консоль, но не падает — холодный старт большого проекта может
     занять больше минуты). Поэтому обёрнутая команда (если есть) спавнится
     ДО детекта, а не после.
  2. Пробует HTTPS-запрос с коротким таймаутом: получилось — https://,
     не получилось — http://.
  Итог — http(s)://localhost:\${PORT}, без ручной настройки под фреймворк.

Переменные окружения:
  PORT           обязательна, только если используется автодетект (без --target)
  TUNA_DOMAIN    обязательна всегда — публичный домен туннеля
  TUNA_API_KEY   опциональна — токен tuna, если аккаунт его требует

tuna-start их только читает из process.env — не важно, чем они туда положены
(shell-export, Docker env, любой другой .env-загрузчик). В этой монорепе для
app'ов уже есть @tools/workspace-env, поэтому обычно удобнее обернуть
tuna-start им — он провалидирует PORT/TUNA_DOMAIN/TUNA_API_KEY по env.ts app'а
и положит их в process.env до старта tuna-start:
  "dev:tuna": "workspace-env --watch -- tuna-start -- pnpm run dev"
В такой связке --watch нужен ВНЕШНЕМУ workspace-env: при правке .env он
перезапускает всё дерево (и туннель с новым TUNA_DOMAIN, и dev-команду). Если у
самой dev-команды тоже есть свой workspace-env --watch — он сам отключится,
второго watcher'а не будет.

Обёрнутая команда получает в свой env __TUNA_START__=1 — по этому флагу
Vite-плагин @packages/tuna/vite узнаёт, что нужно патчить
server.allowedHosts/server.hmr/preview.allowedHosts под туннель. Двойное
подчёркивание с обеих сторон — та же конвенция "зарезервировано инструментом",
что у __WORKSPACE_ENV__ в @tools/workspace-env: голое TUNA_START слишком
похоже на имя, которое кто-то мог бы дать своей переменной.
`;

function parseArgv(argv) {
  const dashIndex = argv.indexOf('--');
  const flagArgs = dashIndex === -1 ? argv : argv.slice(0, dashIndex);
  const command = dashIndex === -1 ? null : argv.slice(dashIndex + 1);

  // -h/--help — только среди СВОИХ флагов (до "--"): "-- <команда> --help"
  // должен долетать до обёрнутой команды как есть, не перехватываться тут.
  if (flagArgs.includes('-h') || flagArgs.includes('--help')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const out = { target: null, command };
  for (let i = 0; i < flagArgs.length; i++) {
    if (flagArgs[i] === '--target') {
      out.target = flagArgs[++i];
      continue;
    }
    console.error(`tuna-start: неизвестный флаг "${flagArgs[i]}" (см. tuna-start --help)`);
    process.exit(1);
  }
  if (command && command.length === 0) {
    console.error('tuna-start: после "--" ожидается команда');
    process.exit(1);
  }
  return out;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`tuna-start: переменная окружения ${name} не задана`);
    process.exit(1);
  }
  return value;
}

/** Подставляет {ИМЯ} → process.env.ИМЯ для каждого плейсхолдера в строке. */
function resolveTemplate(template) {
  return template.replace(/\{(\w+)\}/g, (_match, name) => requireEnv(name));
}

// Без верхнего предела и без фиксированного числа, подбираемого руками под
// конкретный app: холодный старт большого Nest-проекта (webpack + ts-patch/
// typia-трансформы) на медленной машине может занять больше 60с — жёсткий
// таймаут-провал там просто ломает dev-туннель без всякой пользы. Вместо
// этого — первые PORT_WAIT_GRACE_MS ждём молча (обычный случай, порт
// открывается быстро), а после — не падаем, а раз в
// PORT_WAIT_WARN_INTERVAL_MS пишем предупреждение с числом попыток и
// продолжаем ждать. Выйти из ожидания снаружи можно как обычно — Ctrl+C
// (SIGINT, см. main()) или падение самой обёрнутой dev-команды (её 'exit'
// зовёт shutdown() → process.exit(), который обрывает и этот цикл).
const PORT_WAIT_GRACE_MS = 60_000;
const PORT_WAIT_WARN_INTERVAL_MS = 10_000;
const PORT_WAIT_POLL_MS = 300;

/** Ждёт, пока порт начнёт принимать TCP-соединения (poll, без таймаута). */
function waitForPort(port, host) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let attempt = 0;
    let lastWarnAt = 0;

    function tryConnect() {
      attempt += 1;
      const socket = net.connect({ port, host, timeout: 1000 });
      const onFail = () => {
        socket.destroy();
        const elapsed = Date.now() - startedAt;
        if (elapsed >= PORT_WAIT_GRACE_MS && elapsed - lastWarnAt >= PORT_WAIT_WARN_INTERVAL_MS) {
          lastWarnAt = elapsed;
          console.warn(
            `tuna-start: порт ${port} на ${host} всё ещё не открылся (${Math.round(elapsed / 1000)}с, попытка ${attempt}) — продолжаю ждать...`,
          );
        }
        setTimeout(tryConnect, PORT_WAIT_POLL_MS);
      };
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', onFail);
      socket.once('timeout', onFail);
    }

    tryConnect();
  });
}

/**
 * Один HTTPS-запрос с коротким таймаутом: получилось — там https (сертификат
 * не проверяем, rejectUnauthorized: false — mkcert-сертификаты локальные,
 * самоподписанные, доверие не важно, важен только факт TLS-рукопожатия).
 * Не получилось (TLS не поднялся/сервер не понял ClientHello) — там http.
 */
function probeHttps(port, host, timeoutMs) {
  return new Promise((resolve) => {
    const req = https.request(
      { host, port, method: 'HEAD', path: '/', rejectUnauthorized: false, timeout: timeoutMs },
      () => {
        req.destroy();
        resolve(true);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function detectTarget() {
  const port = requireEnv('PORT');
  const host = 'localhost';

  await waitForPort(port, host);

  const isHttps = await probeHttps(port, host, 2000);
  return `${isHttps ? 'https' : 'http'}://${host}:${port}`;
}

async function main() {
  const { target, command } = parseArgv(process.argv.slice(2));

  const domain = requireEnv('TUNA_DOMAIN');
  const apiKey = process.env.TUNA_API_KEY;

  /** @type {import('child_process').ChildProcess[]} */
  const children = [];
  let shuttingDown = false;

  function shutdown(code) {
    if (shuttingDown) return;
    shuttingDown = true;

    let pending = children.length;
    if (pending === 0) {
      process.exit(code);
      return;
    }
    for (const child of children) {
      // Колбэк вызывается и на ошибке (например, процесс уже мёртв) — это
      // ожидаемо, не повод не завершать остальных/не выйти самим.
      treeKill(child.pid, () => {
        pending -= 1;
        if (pending === 0) process.exit(code);
      });
    }
  }

  function spawnChild(label, cmd, args, extraEnv) {
    const proc = crossSpawn(cmd, args, {
      stdio: 'inherit',
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    });
    proc.on('error', (err) => {
      console.error(`tuna-start: не удалось запустить "${label}": ${err.message}`);
      shutdown(1);
    });
    proc.on('exit', (code, signal) => {
      shutdown(code ?? (signal ? 1 : 0));
    });
    children.push(proc);
    return proc;
  }

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  // Дев-команду спавним ДО определения цели — иначе автодетекту нечего
  // ждать (порт откроет именно она). При явном --target порядок роли не
  // играет, но простоты ради он тот же в обоих случаях.
  if (command) {
    const [cmd, ...cmdArgs] = command;
    spawnChild(cmd, cmd, cmdArgs, { __TUNA_START__: '1' });
  }

  const targetUrl = target ? resolveTemplate(target) : await detectTarget();
  if (shuttingDown) return; // дев-команда уже упала, пока мы детектили

  const tunaArgs = ['http', targetUrl, `--domain=${domain}`];
  if (apiKey) tunaArgs.push(`--token=${apiKey}`);
  spawnChild('tuna', 'tuna', tunaArgs);
}

main();
