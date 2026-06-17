#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

function printHelp() {
  console.log(`Использование: pnpm kill:port [порт...]

Завершает процессы, слушающие указанные TCP-порты (Windows, Linux, macOS).

Без аргументов — интерактивный режим (порты из apps/*/.env).

Примеры:
  pnpm kill:port
  pnpm kill:port 3000
  pnpm kill:port 3000 5173
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

function discoverAppPorts(root = process.cwd()) {
  const appsDir = path.join(root, 'apps');
  if (!fs.existsSync(appsDir)) return [];

  const result = [];
  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const envCandidates = [
      path.join(appsDir, entry.name, '.env'),
      path.join(appsDir, entry.name, '.env.example'),
    ];

    for (const envPath of envCandidates) {
      if (!fs.existsSync(envPath)) continue;
      const match = fs.readFileSync(envPath, 'utf8').match(/^PORT=(\d+)/m);
      if (match) {
        result.push({ app: entry.name, port: Number(match[1]) });
        break;
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

function formatPortStatus(port) {
  const pids = getPidsOnPort(port);
  if (pids.length === 0) return 'свободен';
  return `занят (PID ${pids.join(', ')})`;
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

function defaultInteractivePorts(appPorts) {
  const occupied = appPorts.find((item) => getPidsOnPort(item.port).length > 0);
  if (occupied) return [occupied.port];
  if (appPorts.length > 0) return [appPorts[0].port];
  return [3000];
}

function portsFromSelection(input, appPorts) {
  const trimmed = input.trim();
  if (!trimmed) return defaultInteractivePorts(appPorts);

  const parts = trimmed.split(/[\s,]+/).filter(Boolean);
  const ports = [];

  for (const part of parts) {
    if (part === '0') return null;

    const index = Number(part);
    if (Number.isInteger(index) && index >= 1 && index <= appPorts.length) {
      ports.push(appPorts[index - 1].port);
      continue;
    }

    if (isValidPort(part)) {
      ports.push(Number(part));
      continue;
    }

    console.error(`❌ Некорректный выбор: ${part}`);
    process.exit(1);
  }

  return [...new Set(ports)];
}

async function askManualPorts() {
  const answer = await question('Порт (несколько через пробел): ');
  const parts = answer.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  return parsePorts(parts);
}

async function interactivePorts() {
  console.log('\n🔪 Освободить порт\n');

  const appPorts = discoverAppPorts();

  if (appPorts.length > 0) {
    console.log('Приложения:');
    appPorts.forEach((item, index) => {
      console.log(
        `  ${index + 1}) ${item.app} — ${item.port} [${formatPortStatus(item.port)}]`,
      );
    });
    console.log('  0) Ввести порт вручную\n');

    const answer = await question(
      'Выбор (номер, несколько через запятую, Enter — первый занятый): ',
    );
    const selected = portsFromSelection(answer, appPorts);

    if (selected === null) return askManualPorts();
    return selected;
  }

  const answer = await question('Порт [3000]: ');
  const value = answer.trim() || '3000';
  if (!isValidPort(value)) {
    console.error(`❌ Некорректный порт: ${value}`);
    process.exit(1);
  }
  return [Number(value)];
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const ports = argv.length > 0 ? parsePorts(argv) : await interactivePorts();
  rl.close();

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
  rl.close();
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});
