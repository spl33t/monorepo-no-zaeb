import { existsSync } from "node:fs";
import path from "node:path";

/** Walk up from startDir until pnpm-workspace.yaml is found. */
export function findMonorepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`[node-run] pnpm-workspace.yaml not found from ${startDir}`);
    }
    dir = parent;
  }
}
