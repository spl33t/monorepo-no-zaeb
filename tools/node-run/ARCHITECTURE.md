# node-run architecture

Runtime for Node/Nest apps in this monorepo: **compile with ttsc, run dist with tsx**, always via `node-run`.

## Commands

| Command | Behavior |
|---------|----------|
| `dev` | effective tsconfig → `ttsc --emit --watch`, after each `watch build complete` → link `node_modules` into dist, then (once) `tsx watch` on `package.json#main` |
| `build` | effective tsconfig → `ttsc --emit`, then link `node_modules` into dist |
| `start` | ensure links, then `tsx` on `package.json#main` (no watch) |

Entry resolution: `NODE_RUN_ENTRY` or `package.json#main`.

## Effective tsconfig (always)

`build` / `dev` do **not** pass the app `tsconfig.json` raw to ttsc. They call [`writeEffectiveTsconfig`](src/writeEffectiveTsconfig.ts):

1. Base file: `NODE_RUN_TSCONFIG` or `tsconfig.json` in the app cwd.
2. `rootDir` = relative path to monorepo root from [`findMonorepoRoot`](src/findMonorepoRoot.ts) (`pnpm-workspace.yaml`).
3. `paths["@/*"]` is always `./src/*`. Other aliases (e.g. `@monorepo/*`) stay as declared in the app tsconfig — not invented by node-run.
4. `plugins` always include `@ttsc/paths` (get-tsconfig drops ttsc-only plugins).
5. Written next to the base as `tsconfig.node-run.json` (JSONC with a DO NOT EDIT comment).

So a missing/wrong `rootDir` or forgotten `@ttsc/paths` cannot break the emit mirror contract. Shared package aliases remain manual in the app tsconfig. Do not edit the generated file — change the original instead.

## Two resolve layers

### 1. `@monorepo/*` (compile-time)

- TypeScript `paths`: `@monorepo/*` → `packages/*/src` (still in app/IDE tsconfig)
- Effective emit: `@ttsc/paths` + `rootDir` = monorepo root → mirror under `dist/...` (e.g. `dist/packages/core/...`)
- In JS, aliases become **relative** `require`s into that mirror

App `package.json` does **not** need `workspace:*` on `@monorepo/*`.

### 2. npm deps of packages (runtime isolation) — variant A

Emit puts code under `apps/<app>/dist/<rel>/...`, while deps live at `<monorepoRoot>/<rel>/node_modules`.

**Contract:** after emit, [`linkDistPackageNodeModules`](src/linkDistPackageNodeModules.ts) creates:

`dist/<rel>/node_modules` → junction/symlink → `<monorepoRoot>/<rel>/node_modules`

whenever `<rel>/package.json` and `<rel>/node_modules` exist at the monorepo root (any mirrored folder — not hardcoded to `packages/`).

Then normal Node walk finds the **same isolated** deps as the source package. No `NODE_PATH`, no require-hook.

**Out of contract:** deleting dist links and running without `node-run` build/start/dev. Relying on pnpm bin `NODE_PATH` is accidental, not the architecture.

## Docker note

Junctions point at host paths. In images, either run the same link step against paths inside the image, or copy/`pnpm deploy` package `node_modules` beside emit.

## Related

- Agent skill: `.cursor/skills/monorepo-modules-imports/SKILL.md`
