import { spawn, type ChildProcess } from "node:child_process";
import { resolveTsxCli } from "./resolveTsx";

type RunDistOptions = {
  entry: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  watch?: boolean;
  watchInclude?: string;
};

function tsxDistArgs(options: {
  entry: string;
  watch?: boolean;
  watchInclude?: string;
}): string[] {
  const args = [resolveTsxCli()];

  if (options.watch) {
    args.push("watch", "--clear-screen=false");
    if (options.watchInclude) {
      args.push("--include", options.watchInclude);
    }
  }

  args.push(options.entry);
  return args;
}

/** Run already-built dist entry via tsx (with or without watch). */
export function runDist(options: RunDistOptions): ChildProcess {
  const { entry, cwd, env, watch, watchInclude } = options;

  return spawn(process.execPath, tsxDistArgs({ entry, watch, watchInclude }), {
    cwd,
    env,
    stdio: "inherit",
  });
}
