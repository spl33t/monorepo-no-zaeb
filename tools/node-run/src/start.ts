import { existsSync } from "node:fs";
import { linkDistPackageNodeModules } from "./linkDistPackageNodeModules";
import { resolveEntry } from "./resolveEntry";
import { runDist } from "./runtime";

export function runStart(nodeEnv = "production"): void {
  const cwd = process.cwd();
  const entry = resolveEntry(cwd);

  if (!existsSync(entry)) {
    process.stderr.write(`[node-run] missing ${entry}. Run "pnpm build" first.\n`);
    process.exit(1);
  }

  linkDistPackageNodeModules(cwd);

  const env = { ...process.env, NODE_ENV: nodeEnv };
  const child = runDist({ entry, cwd, env });

  child.on("error", (err) => {
    process.stderr.write(`[node-run] tsx failed to start: ${err.message}\n`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
