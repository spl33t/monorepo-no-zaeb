#!/usr/bin/env node --experimental-strip-types
import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import { existsSync, rmSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { type Readable } from "node:stream";

type Command = "dev" | "build" | "start";
type BuilderMode = "dev" | "prod";
type ProcName = "tsdown" | "node";
type RunningChild = ChildProcessByStdio<null, Readable, Readable>;

const COMMANDS: Command[] = ["dev", "build", "start"];
const DIST_DIR = path.join(process.cwd(), "dist");
const READY_FILE = path.join(DIST_DIR, ".ready");
const ENV_FILE = path.join(process.cwd(), ".env");
const POLL_MS = 50;
const STDIO_PIPE: ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];
const USE_SHELL = process.platform === "win32";

const rawArgv = process.argv.slice(2);

function resolveEntry(): string {
  const fromEnv = process.env.NODE_RUN_ENTRY;
  if (fromEnv) return path.resolve(process.cwd(), fromEnv);

  const pkgPath = path.join(process.cwd(), "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { main?: string };
      if (typeof pkg.main === "string" && pkg.main.length > 0) {
        return path.resolve(process.cwd(), pkg.main);
      }
    } catch {}
  }

  return path.join(process.cwd(), "dist", "index.cjs");
}

const ENTRY = resolveEntry();

function printHelp() {
  process.stderr.write(`Использование: node-run <команда> [опции]

Команды:
  dev       tsdown --dev (watch) + node (restart on dist/.ready / .env)
  build     tsdown --prod
  start     node <package.json#main>

Опции:
  --node-env=<value>   NODE_ENV для node. Не меняет BUILDER_MODE.
  -h, --help

Переменные окружения:
  BUILDER_MODE         dev|prod — задаётся командой, читает tsdown.config.ts
  NODE_RUN_ENTRY       entry вместо package.json#main

Примеры:
  pnpm dev
  pnpm build
  pnpm start
`);
}

function parseArgs() {
  if (rawArgv.includes("-h") || rawArgv.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const command = rawArgv.find((arg): arg is Command => COMMANDS.includes(arg as Command));
  if (!command) {
    printHelp();
    process.exit(1);
  }

  const builderMode: BuilderMode = command === "dev" ? "dev" : "prod";
  const nodeEnvFlag = rawArgv.find((arg) => arg.startsWith("--node-env="));
  const nodeEnv =
    nodeEnvFlag?.slice("--node-env=".length) ?? process.env.NODE_ENV ?? builderMode;

  return { command, builderMode, nodeEnv };
}

const { command, builderMode, nodeEnv } = parseArgs();

const tasks = new Set<RunningChild>();
let shuttingDown = false;

function childEnv(): NodeJS.ProcessEnv {
  return { ...process.env, BUILDER_MODE: builderMode, NODE_ENV: nodeEnv };
}

function writeLog(source: ProcName, data: Buffer | string) {
  for (const line of data.toString().replace(/\r/g, "").split("\n")) {
    if (line.length > 0) process.stderr.write(`[${source}] ${line}\n`);
  }
}

function tsdownArgs(mode: BuilderMode): string[] {
  return ["exec", "tsdown", "--config-loader", "unrun", mode === "dev" ? "--dev" : "--prod"];
}

function spawnTsdown(mode: BuilderMode): RunningChild {
  const child = spawn("pnpm", tsdownArgs(mode), {
    cwd: process.cwd(),
    env: childEnv(),
    stdio: STDIO_PIPE,
    shell: USE_SHELL,
  }) as RunningChild;

  trackProcess(child, "tsdown");
  return child;
}

function runTsdownBuild(mode: BuilderMode): number {
  const result = spawnSync("pnpm", tsdownArgs(mode), {
    cwd: process.cwd(),
    env: childEnv(),
    stdio: STDIO_PIPE,
    shell: USE_SHELL,
  });

  if (result.error) {
    process.stderr.write(`[tsdown] ${result.error.message}\n`);
    return 1;
  }

  if (result.stdout?.length) writeLog("tsdown", result.stdout);
  if (result.stderr?.length) writeLog("tsdown", result.stderr);

  return result.status ?? 1;
}

function trackProcess(p: RunningChild, name: ProcName) {
  tasks.add(p);
  p.stdout.on("data", (chunk) => writeLog(name, chunk));
  p.stderr.on("data", (chunk) => writeLog(name, chunk));
  p.on("exit", () => tasks.delete(p));
}

function spawnNode(): RunningChild {
  return spawn(process.execPath, ["--enable-source-maps", ENTRY], {
    env: childEnv(),
    stdio: STDIO_PIPE,
  });
}

let nodeProcess: RunningChild | null = null;
let restartQueue = Promise.resolve();
let stopping = false;

const readyPoll = { last: null as number | null, restartOnFirst: true };
const envPoll = { last: null as number | null, restartOnFirst: false };

function pollMtime(
  file: string,
  state: { last: number | null; restartOnFirst: boolean },
) {
  try {
    if (!existsSync(file)) return;
    const mtime = statSync(file).mtimeMs;

    if (state.last === null) {
      state.last = mtime;
      if (state.restartOnFirst) queueNodeRestart();
      return;
    }

    if (mtime !== state.last) {
      state.last = mtime;
      queueNodeRestart();
    }
  } catch {}
}

async function stopNodeProcess() {
  if (stopping) return;
  stopping = true;

  const proc = nodeProcess;
  nodeProcess = null;

  if (!proc || proc.exitCode !== null || proc.signalCode !== null) {
    stopping = false;
    return;
  }

  proc.kill("SIGTERM");
  await new Promise<void>((resolve) => proc.once("exit", () => resolve()));
  stopping = false;
}

async function restartNode() {
  if (shuttingDown || !existsSync(ENTRY)) return;

  await stopNodeProcess();
  if (shuttingDown) return;

  nodeProcess = spawnNode();
  trackProcess(nodeProcess, "node");
}

function queueNodeRestart() {
  restartQueue = restartQueue.then(() => restartNode()).catch((err: Error) => {
    process.stderr.write(`[node] restart failed: ${err.message}\n`);
  });
}

function watchDevRestarts() {
  const tick = () => {
    pollMtime(READY_FILE, readyPoll);
    pollMtime(ENV_FILE, envPoll);
  };

  tick();
  setInterval(tick, POLL_MS);
}

function cleanDistForDev() {
  if (!existsSync(DIST_DIR)) return;
  rmSync(DIST_DIR, { recursive: true, force: true });
}

function runDev() {
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const p of tasks) {
      try {
        p.kill("SIGTERM");
      } catch {}
    }
    setTimeout(() => process.exit(0), 300);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  cleanDistForDev();
  spawnTsdown("dev");
  watchDevRestarts();
}

function runBuild() {
  process.exit(runTsdownBuild("prod"));
}

function runStart() {
  if (!existsSync(ENTRY)) {
    process.stderr.write(`start: missing ${ENTRY}. Run "pnpm build" first.\n`);
    process.exit(1);
  }

  const child = spawnNode();
  trackProcess(child, "node");
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", () => process.exit(1));
}

switch (command) {
  case "dev":
    runDev();
    break;
  case "build":
    runBuild();
    break;
  case "start":
    runStart();
    break;
}
