import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { getPortFromEnv } from "../../lib/env-utils";
import { cleanDist } from "./cleanDist";
import { linkDistPackageNodeModules } from "./linkDistPackageNodeModules";
import { resolveEntry } from "./resolveEntry";
import { resolveTtscCli } from "./resolveTtsc";
import { runDist } from "./runtime";
import { writeEffectiveTsconfig } from "./writeEffectiveTsconfig";

export function runDev(nodeEnv = "dev"): void {
  getPortFromEnv();

  const cwd = process.cwd();
  const entry = resolveEntry(cwd);
  const distDir = path.join(cwd, "dist");
  const env = { ...process.env, NODE_ENV: nodeEnv };
  const node = process.execPath;
  const ttscCli = resolveTtscCli();

  cleanDist(cwd);
  const tsconfig = writeEffectiveTsconfig(cwd);

  let shuttingDown = false;
  let tsxStarted = false;
  let tsxProc: ChildProcess | null = null;

  const ttscProc = spawn(
    node,
    [ttscCli, "-p", tsconfig, "--emit", "--watch", "--preserveWatchOutput"],
    { cwd, env, stdio: ["ignore", "pipe", "pipe"] },
  );

  const onTtscOut = (chunk: Buffer) => {
    process.stderr.write(chunk);
    if (shuttingDown) return;
    if (!chunk.toString().includes("watch build complete")) return;

    linkDistPackageNodeModules(cwd);

    if (tsxStarted) return;
    tsxStarted = true;
    tsxProc = runDist({ entry, cwd, env, watch: true, watchInclude: distDir });
    tsxProc.on("exit", (code) => {
      if (shuttingDown) return;
      shuttingDown = true;
      try {
        ttscProc.kill("SIGTERM");
      } catch {}
      process.exit(code ?? 1);
    });
  };

  ttscProc.stdout?.on("data", onTtscOut);
  ttscProc.stderr?.on("data", onTtscOut);

  ttscProc.on("error", (err) => {
    process.stderr.write(`[node-run] ttsc failed to start: ${err.message}\n`);
    process.exit(1);
  });

  ttscProc.on("exit", (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      tsxProc?.kill("SIGTERM");
    } catch {}
    process.exit(code ?? 1);
  });

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      tsxProc?.kill("SIGTERM");
    } catch {}
    try {
      ttscProc.kill("SIGTERM");
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
