---
name: monorepo-scaffold-cli
description: >-
  Scaffold apps via thin toolchain create:app + shared tools/lib/create-app-shell
  (generators stay per-toolchain). Global utils (docker-compose, kill-port,
  remove-app) via root tools/. Removing/deleting an app — use remove:app, not
  rm -rf (it also strips the docker-compose service entry and prunes the
  lockfile). Do not scaffold packages/ — free-form folders. Prefer
  non-interactive one-liners when options are known; otherwise tell the user to
  run the interactive script. Do not dump CLI help—use --help / tools/README.md.
---

# Скаффолдинг через CLI

## Когда применять

Новый app в `nestjs-apps/apps` или `vite-apps/apps`, правки `docker-compose`, удаление app.  
**Не** генерировать `packages/` — это обычные папки с общим кодом.

## Как действовать

1. Параметры ясны — one-liner с `--`.
2. Неясно — интерактивный скрипт у пользователя.
3. Общий код мира — предложи создать папку в `*/packages/` вручную.
4. Удалить app — `remove:app`, не `rm -rf` (снимает и сервис из `docker-compose.yml`).

## Жёсткие правила

- Только **`npm`** (workspaces внутри тулчейна, не на root).
- Nest app: classic — `nest-cli.json`, `nest`/`@nestjs/cli` резолвится из toolchain-root deps (без шима); nestia — deps (`ttsc`, TS 7, typia…) на app, не в корне тулчейна.
- При create:app спросить/передать `--kind nestjs|nestia`.
- Vite app: `vite`/`tsc` резолвятся из toolchain-root deps напрямую (без шима, без линковки `@monorepo/vite-apps`).
- VAR=VAL перед командой (NODE_ENV и т.п.) — просто `cross-env` (root dependency), без `npx --prefix`: `npm run` сам добавляет `node_modules/.bin` каждого предка в PATH (`@npmcli/run-script`), поэтому резолвится без обёрток/шимов.
- Общий flow create-app — `tools/lib/create-app-shell.js`; generators — только в тулчейне.
- packages: root → `@root-packages/*`; `*/packages` → `@toolchain-packages/*` (deps isomorphic в root package.json).

## Команды

| Сценарий | Входная точка |
|----------|----------------|
| Nest app | `cd nestjs-apps && npm run create:app` |
| Vite app | `cd vite-apps && npm run create:app` |
| Удалить app | `npm run remove:app -- <name> [--toolchain nestjs\|vite] [--yes]` (без аргументов — интерактивно) |
| Docker | `npm run docker:create-compose`, `npm run docker:*` |
| Deps | `npm run deps:install` (без флагов; Docker/CI/NODE_ENV определяются сами) |
