#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * `@inquirer/prompts` — ESM-only с v8 (проверено — `require()` из этого
 * CommonJS-файла упал бы с ERR_REQUIRE_ESM), поэтому грузится через
 * динамический `import()` — стандартный мост ESM→CJS в Node.
 * @returns {Promise<{ checkbox: Function, input: Function }>}
 */
function loadPrompts() {
  return import('@inquirer/prompts');
}

function printHelp() {
  console.log(`Использование: pnpm run kill:port -- [порт...]

Завершает процессы, слушающие указанные TCP-порты (Windows, Linux, macOS).

Без аргументов — интерактивный режим (порты из apps/*).

Примеры:
  pnpm run kill:port
  pnpm run kill:port -- 3000
  pnpm run kill:port -- 3000 5173
`);
}

function isValidPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function parsePorts(argv) {
  const ports = [];
  for (const arg of argv) {
    if (!isValidPort(arg)) {
      console.error(`❌ Некорректный порт: ${arg}`);
      process.exit(1);
    }
    ports.push(Number(arg));
  }
  return [...new Set(ports)];
}

function discoverAppPorts(root) {
  const layout = require('../lib/monorepo-layout');
  const repoRoot = root || layout.findMonorepoRoot();
  const result = [];

  for (const app of layout.listApps(repoRoot)) {
    const envPath = path.join(app.absDir, '.env');
    if (fs.existsSync(envPath)) {
      const match = fs.readFileSync(envPath, 'utf8').match(/^PORT=(\d+)/m);
      if (match) {
        result.push({ app: `${app.relPosix}`, port: Number(match[1]) });
      }
    }
  }

  return result;
}

function getPidsWindows(port) {
  const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
  const pids = new Set();
  const portSuffix = `:${port}`;

  for (const line of out.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue;
    const localAddress = line.trim().split(/\s+/)[1];
    if (!localAddress || !localAddress.endsWith(portSuffix)) continue;

    const pid = line.trim().split(/\s+/).at(-1);
    if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
  }

  return [...pids];
}

function getPidsUnix(port) {
  const commands = [
    `lsof -tiTCP:${port} -sTCP:LISTEN`,
    `fuser -n tcp ${port} 2>/dev/null`,
    `ss -lptn 'sport = :${port}'`,
  ];

  for (const cmd of commands) {
    try {
      const out = execSync(cmd, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: true,
      }).trim();

      if (!out) continue;

      if (cmd.startsWith('fuser')) {
        const pids = out
          .replace(/^.*:\s*/, '')
          .split(/\s+/)
          .filter((v) => /^\d+$/.test(v));
        if (pids.length > 0) return [...new Set(pids)];
        continue;
      }

      if (cmd.startsWith('ss')) {
        const pids = [...out.matchAll(/pid=(\d+)/g)].map((m) => m[1]);
        if (pids.length > 0) return [...new Set(pids)];
        continue;
      }

      const pids = out.split(/\s+/).filter((v) => /^\d+$/.test(v));
      if (pids.length > 0) return [...new Set(pids)];
    } catch {
      // пробуем следующую команду
    }
  }

  return [];
}

function getPidsOnPort(port) {
  return process.platform === 'win32' ? getPidsWindows(port) : getPidsUnix(port);
}

function killPid(pid) {
  if (process.platform === 'win32') {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    return;
  }
  process.kill(Number(pid), 'SIGKILL');
}

function killPort(port) {
  const pids = getPidsOnPort(port);

  if (pids.length === 0) {
    console.log(`ℹ️  Порт ${port}: процессов не найдено`);
    return 0;
  }

  let killed = 0;
  for (const pid of pids) {
    try {
      killPid(pid);
      console.log(`✅ Порт ${port}: завершён PID ${pid}`);
      killed++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`❌ Порт ${port}: не удалось завершить PID ${pid} — ${message}`);
    }
  }

  return killed > 0 ? 0 : 1;
}

/**
 * Порты из apps/* — checkbox, ничего не предвыбрано (явный выбор). Плюс
 * отдельный input для портов вне списка apps/* — заменяет старый "0) ввести
 * вручную", можно комбинировать с выбором из списка.
 * @returns {Promise<number[]>}
 */
async function interactivePorts() {
  const { checkbox, input } = await loadPrompts();

  console.log('\n🔪 Освободить порт\n');

  const appPorts = discoverAppPorts();

  if (appPorts.length > 0) {
    const selected = await checkbox({
      message: 'Выберите порты для освобождения',
      choices: appPorts.map((item) => {
        const pids = getPidsOnPort(item.port);
        const status = pids.length === 0 ? 'свободен' : `занят (PID ${pids.join(', ')})`;
        return {
          name: `${item.app} — ${item.port} [${status}]`,
          value: item.port,
        };
      }),
      // Дефолт склеивает декорированный name (со статусом в скобках) —
      // после подтверждения нужны только сами порты.
      theme: {
        style: {
          renderSelectedChoices: (chosen) => chosen.map((c) => c.value).join(', '),
        },
      },
    });

    const manual = await input({
      message: 'Ещё порты вручную, через пробел (Enter — пропустить)',
      default: '',
    });
    const manualPorts = manual.trim() ? parsePorts(manual.trim().split(/\s+/)) : [];

    return [...new Set([...selected, ...manualPorts])];
  }

  const value = await input({ message: 'Порт', default: '3000' });
  if (!isValidPort(value.trim())) {
    console.error(`❌ Некорректный порт: ${value}`);
    process.exit(1);
  }
  return [Number(value.trim())];
}

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--');

  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const ports = argv.length > 0 ? parsePorts(argv) : await interactivePorts();

  if (ports.length === 0) {
    console.log('Отменено.');
    process.exit(0);
  }

  let exitCode = 0;
  for (const port of ports) {
    const code = killPort(port);
    if (code !== 0) exitCode = code;
  }

  process.exit(exitCode);
}

main().catch((err) => {
  if (err?.name === 'ExitPromptError') {
    console.log('\nОтменено');
    process.exit(0);
  }
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});
