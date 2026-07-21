import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

export function resolveTtscCli(): string {
  const pkgPath = require.resolve("ttsc/package.json");
  const pkg = require("ttsc/package.json") as { bin?: { ttsc?: string } };
  const rel = pkg.bin?.ttsc;

  if (typeof rel !== "string" || rel.length === 0) {
    throw new Error("ttsc bin entry not found in @monorepo/node-run dependencies");
  }

  return path.join(path.dirname(pkgPath), rel);
}
