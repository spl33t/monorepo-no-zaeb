import { runBuild } from "./build";
import { runDev } from "./dev";
import { runStart } from "./start";

const USAGE = "node-run <dev|build|start> [--node-env=<value>]";

function printHelp(): void {
  process.stderr.write(`Usage: ${USAGE}

Commands:
  dev     ttsc --watch, then tsx watch on dist
  build   ttsc --emit
  start   tsx package.json#main (dist)

Options:
  --node-env=<value>   NODE_ENV for child processes

Environment:
  NODE_RUN_TSCONFIG    base tsconfig (default: tsconfig.json); node-run
                       writes an effective config that always sets rootDir
                       to the monorepo root and ensures @ttsc/paths
  NODE_RUN_ENTRY       entry file instead of package.json#main
`);
}

export function runCli(argv: readonly string[]): void {
  const args = argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    return;
  }

  const command = args.find((arg) => !arg.startsWith("-"));
  const nodeEnvFlag = args.find((arg) => arg.startsWith("--node-env="));
  const nodeEnv =
    nodeEnvFlag?.slice("--node-env=".length) ??
    (command === "dev" ? "dev" : "production");

  switch (command) {
    case "dev":
      runDev(nodeEnv);
      return;
    case "build":
      runBuild(nodeEnv);
      return;
    case "start":
      runStart(nodeEnv);
      return;
    default:
      printHelp();
      process.exit(1);
  }
}
