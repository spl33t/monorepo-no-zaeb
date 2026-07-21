import { spawnSync } from "node:child_process";
import { cleanDist } from "./cleanDist";
import { linkDistPackageNodeModules } from "./linkDistPackageNodeModules";
import { resolveTtscCli } from "./resolveTtsc";
import { writeEffectiveTsconfig } from "./writeEffectiveTsconfig";

export function runBuild(nodeEnv = "production"): void {
  const cwd = process.cwd();
  const env = { ...process.env, NODE_ENV: nodeEnv };

  cleanDist(cwd);
  const tsconfig = writeEffectiveTsconfig(cwd);

  const result = spawnSync(
    process.execPath,
    [resolveTtscCli(), "-p", tsconfig, "--emit"],
    { cwd, env, stdio: "inherit" },
  );

  if (result.error) {
    process.stderr.write(`[node-run] ttsc failed to start: ${result.error.message}\n`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const linked = linkDistPackageNodeModules(cwd);
  if (linked > 0) {
    process.stderr.write(`[node-run] linked node_modules for ${linked} package(s) in dist\n`);
  }

  process.exit(0);
}
