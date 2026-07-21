import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function resolveEntry(cwd = process.cwd()): string {
  const fromEnv = process.env.NODE_RUN_ENTRY;
  if (fromEnv) return path.resolve(cwd, fromEnv);

  const pkgPath = path.join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`package.json not found in ${cwd}`);
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { main?: string };
  if (typeof pkg.main !== "string" || pkg.main.length === 0) {
    throw new Error("package.json#main is required");
  }

  return path.resolve(cwd, pkg.main);
}
