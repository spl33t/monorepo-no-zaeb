import { existsSync, rmSync } from "node:fs";
import path from "node:path";

/** Remove app `dist/` so emit starts from a clean tree (no orphan files). */
export function cleanDist(appCwd = process.cwd()): void {
  const distDir = path.join(path.resolve(appCwd), "dist");
  if (!existsSync(distDir)) return;
  rmSync(distDir, { recursive: true, force: true });
}
