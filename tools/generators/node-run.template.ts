#!/usr/bin/env node
import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { type Readable } from "node:stream";
import ts from "typescript";

type Command = "dev" | "build" | "start";
type BuilderMode = "dev" | "prod";
type ProcName = "tsdown" | "node" | "tsc";
type Watcher = ts.WatchOfConfigFile<ts.EmitAndSemanticDiagnosticsBuilderProgram>;
type RunningChild = ChildProcessByStdio<null, Readable, Readable>;
type SpawnOptions = { cmd: string; args?: string[]; shell: boolean };

const COMMANDS: Command[] = ["dev", "build", "start"];
const ENTRY = path.join(process.cwd(), "dist/index.cjs");
const ENV_FILE = path.join(process.cwd(), ".env");
const TSDOWN_CMD = "pnpm exec tsdown";
const STDIO_PIPE: ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];
const TSC_OPTIONS: ts.CompilerOptions = { noEmit: true };
const formatHost: ts.FormatDiagnosticsHost = {
  getCurrentDirectory: () => process.cwd(),
  getCanonicalFileName: (fileName) => fileName,
  getNewLine: () => "\n",
};

const rawArgv = process.argv.slice(2);

function printHelp() {
  process.stderr.write(`Использование: run <команда> [опции]

Команды (как в vite):
  dev       BUILDER_MODE=dev — tsdown watch + tsc watch + node --watch
  build     BUILDER_MODE=prod — tsc --noEmit, затем tsdown
  start     node dist/index.cjs (после сборки)

Опции:
  --node-env=<value>   NODE_ENV для node (рантайм). Не меняет BUILDER_MODE.
  -h, --help           Показать эту справку

Переменные окружения:
  NODE_ENV             По умолчанию dev|prod как у команды; иначе --node-env или env
  BUILDER_MODE         Задаётся командой только для tsdown (dev|prod)

Примеры:
  pnpm dev
  NODE_ENV=staging pnpm start
  pnpm dev --node-env=staging
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
let watcher: Watcher | null = null;
let shuttingDown = false;

function childEnv(): NodeJS.ProcessEnv {
  return { ...process.env, BUILDER_MODE: builderMode, NODE_ENV: nodeEnv };
}

function writeLog(source: ProcName, data: Buffer | string) {
  for (const line of data.toString().replace(/\r/g, "").split("\n")) {
    if (line.length > 0) process.stderr.write(`[${source}] ${line}\n`);
  }
}

function writeTscDiagnostic(input: ts.Diagnostic | string) {
  const text =
    typeof input === "string"
      ? input
      : ts.formatDiagnosticsWithColorAndContext([input], formatHost).trimEnd();

  const lines = text.split("\n");
  if (lines.length === 0 || lines[0].length === 0) return;

  process.stderr.write(`[tsc] ${lines[0]}\n`);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].length > 0) process.stderr.write(`${lines[i]}\n`);
  }
}

type RunTscOptions = { mode: "watch" } | { mode: "check" };

function runTsc(options: RunTscOptions): number | undefined {
  const failOnError = options.mode === "check";

  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    writeTscDiagnostic("tsconfig.json not found");
    return failOnError ? 1 : undefined;
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    writeTscDiagnostic(configFile.error);
    return failOnError ? 1 : undefined;
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
    TSC_OPTIONS,
  );

  if (parsed.errors.length > 0) {
    for (const diag of parsed.errors) writeTscDiagnostic(diag);
    return failOnError ? 1 : undefined;
  }

  const onProgram = (program: ts.Program) => {
    const errors = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.category === ts.DiagnosticCategory.Error);

    for (const diag of errors) writeTscDiagnostic(diag);

    return errors.length > 0 && failOnError ? 1 : 0;
  };

  if (failOnError) {
    return onProgram(
      ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options }),
    );
  }

  const host = ts.createWatchCompilerHost(
    configPath,
    TSC_OPTIONS,
    ts.sys,
    ts.createEmitAndSemanticDiagnosticsBuilderProgram,
    () => {},
    () => {},
  );

  const originalAfterCreate = host.afterProgramCreate;
  host.afterProgramCreate = (builderProgram) => {
    originalAfterCreate?.(builderProgram);
    onProgram(builderProgram.getProgram());
  };

  watcher = ts.createWatchProgram(host) as Watcher;
  return undefined;
}

function trackProcess(p: RunningChild, name: ProcName) {
  tasks.add(p);
  p.stdout.on("data", (chunk) => writeLog(name, chunk));
  p.stderr.on("data", (chunk) => writeLog(name, chunk));
  p.on("exit", () => tasks.delete(p));
}

function spawnLabeled(name: ProcName, options: SpawnOptions, sync = false): number | RunningChild {
  const env = childEnv();

  if (sync) {
    const result = options.shell
      ? spawnSync(options.cmd, { stdio: STDIO_PIPE, shell: true, env })
      : spawnSync(options.cmd, options.args ?? [], { stdio: STDIO_PIPE, shell: false, env });
    if (result.stdout?.length) writeLog(name, result.stdout);
    if (result.stderr?.length) writeLog(name, result.stderr);
    return result.status ?? 1;
  }

  const p = options.shell
    ? spawn(options.cmd, { stdio: STDIO_PIPE, shell: true, env })
    : spawn(options.cmd, options.args ?? [], { stdio: STDIO_PIPE, shell: false, env });
  trackProcess(p, name);
  return p;
}

function runDev() {
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      watcher?.close();
    } catch {}
    for (const p of tasks) {
      try {
        p.kill("SIGTERM");
      } catch {}
    }
    setTimeout(() => process.exit(0), 300);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  spawnLabeled("tsdown", { cmd: TSDOWN_CMD, shell: true });
  // как nodemon watch: ['dist', '.env'] — dist через --watch на entry, .env через --watch-path
  spawnLabeled("node", {
    cmd: process.execPath,
    args: ["--enable-source-maps", "--watch", "--watch-path", ENV_FILE, ENTRY],
    shell: false,
  });
  runTsc({ mode: "watch" });
}

function runBuild() {
  const tscCode = runTsc({ mode: "check" }) ?? 1;
  if (tscCode !== 0) process.exit(tscCode);
  process.exit(spawnLabeled("tsdown", { cmd: TSDOWN_CMD, shell: true }, true) as number);
}

function runStart() {
  if (!existsSync(ENTRY)) {
    process.stderr.write(`start: missing ${ENTRY}. Run "pnpm build" first.\n`);
    process.exit(1);
  }

  const child = spawn(process.execPath, [ENTRY], {
    stdio: ["inherit", "pipe", "pipe"],
    env: childEnv(),
  });
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
