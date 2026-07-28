/**
 * Nest CLI's default webpack config (compilerOptions.webpack: true) needs 4
 * overrides to work with typia/@nestia's ts-patch-based AST transform and
 * with raw-source (no build step) packages/* workspace:*-dependencies.
 * Every override here was found and verified live against a real crash/bug
 * — none are speculative.
 */
function generateWebpackConfig() {
  return `const nodeExternals = require('webpack-node-externals');
const path = require('path');

// dotenv reads .env at runtime (fs.readFileSync), not via require()/import —
// it never enters webpack's module graph, so '--watch' doesn't see edits to
// it by default. Registering it as an explicit file dependency makes webpack
// treat it like any watched source file: editing .env triggers a rebuild,
// which nest-cli's watch runner then restarts the process for (same restart
// path as any .ts change), picking up the new values.
class WatchEnvFilePlugin {
  constructor(filePath) {
    this.filePath = filePath;
  }
  apply(compiler) {
    compiler.hooks.afterCompile.tap('WatchEnvFilePlugin', (compilation) => {
      compilation.fileDependencies.add(this.filePath);
    });
  }
}

module.exports = (options) => {
  // Nest CLI's default devtool is 'false' unless '--debug' is passed, so
  // stack traces normally point at bundled dist/main.js:line:col instead of
  // the real source file. 'source-map' always emits a real .map; Node only
  // consults it if started with --enable-source-maps (see package.json
  // scripts).
  options.devtool = 'source-map';

  // Persists webpack's module/loader cache to node_modules/.cache/webpack
  // (already covered by the blanket node_modules .gitignore rule) across
  // separate process invocations. Measured live: cold 'nest build' ~5.2s ->
  // ~3.2-3.4s once warm; first compile of a fresh '--watch' session ~2.1-2.8s
  // -> ~183ms. Does NOT meaningfully speed up edit-to-edit rebuilds within an
  // already-running watch session (webpack's in-memory incremental graph
  // already handles those).
  options.cache = { type: 'filesystem' };

  // Nest CLI's default externals: [nodeExternals()] leaves EVERYTHING
  // resolved from node_modules (including our workspace:* symlinks) out of
  // the bundle, as a plain require() left for Node to resolve at runtime. For
  // real npm deps that's correct — but for @packages/* (raw .ts, no dist),
  // it means the require() at runtime hits Node's own native TS
  // type-stripping directly, bypassing ts-loader/ts-patch entirely — so
  // typia's transform never runs on that code (confirmed live:
  // NoTransformConfigurationError at runtime even though ts-loader
  // type-checks it fine at build time). allowlist forces @packages/* to
  // actually be bundled (and thus compiled through the same Program as the
  // app) instead of externalized.
  options.externals = [nodeExternals({ allowlist: [/^@packages\\//] })];

  const rules = [].concat(options.module.rules);
  for (const rule of rules) {
    const uses = [].concat(rule.use ?? []);
    const tsLoaderUse = uses.find((u) => (typeof u === 'string' ? u : u?.loader) === 'ts-loader');
    if (tsLoaderUse) {
      // transpileOnly: false makes ts-loader itself run a full type-check
      // (Program-based, required for typia/@nestia's plugins to see real
      // types).
      tsLoaderUse.options.transpileOnly = false;
      // TS6059 ("File is not under rootDir") fires for any @packages/*
      // import once transpileOnly is false, because the Program now spans
      // apps/<name>/src AND the package's real (post-symlink) path. It's a
      // cosmetic diagnostic — ts-loader doesn't write per-file output to
      // disk preserving directory structure, webpack just bundles whatever
      // it emits — so it's safe to ignore rather than widening rootDir to
      // the monorepo root.
      tsLoaderUse.options.ignoreDiagnostics = [6059];
    }
  }

  // Nest CLI's defaults *unconditionally* also add ForkTsCheckerWebpackPlugin
  // (a second, separate full type-check in a forked process) whenever no
  // Nest-CLI-native plugin is registered — which is always true here, since
  // typia/nestia apply through ts-patch, not through nest-cli.json's own
  // plugin registry. Combined with transpileOnly: false above (which makes
  // ts-loader itself do a full type-check), every build would otherwise
  // type-check twice.
  options.plugins = options.plugins.filter((p) => p.constructor?.name !== 'ForkTsCheckerWebpackPlugin');
  options.plugins.push(new WatchEnvFilePlugin(path.resolve(__dirname, '.env')));

  return options;
};
`;
}

module.exports = { generateWebpackConfig };
