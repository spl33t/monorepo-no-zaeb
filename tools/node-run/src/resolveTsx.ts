import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function resolveTsxCli(): string {
  return require.resolve("tsx/cli");
}
