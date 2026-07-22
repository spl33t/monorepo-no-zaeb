---
name: monorepo-scaffold-cli
description: >-
  Scaffold apps via thin toolchain create:app + shared tools/lib/create-app-shell
  (generators stay per-toolchain). Global utils (docker-compose, kill-port) via
  root tools/. Do not scaffold packages/ — free-form folders. Prefer
  non-interactive one-liners when options are known; otherwise tell the user to
  run the interactive script. Do not dump CLI help—use --help / tools/README.md.
---

# Скаффолдинг через CLI

## Когда применять

Новый app в `nestjs-apps/apps` или `vite-apps/apps`, правки `docker-compose`.  
**Не** генерировать `packages/` — это обычные папки с общим кодом.

## Как действовать

1. Параметры ясны — one-liner с `--`.
2. Неясно — интерактивный скрипт у пользователя.
3. Общий код мира — предложи создать папку в `*/packages/` вручную.

## Жёсткие правила

- Только **`npm`** (workspaces внутри тулчейна, не на root).
- Nest app: свой `nest-cli.json`, `webpack: false`, CLI через `@monorepo/nest-cli`.
- Vite app: CLI через `@monorepo/vite-cli` (не линковать `@monorepo/vite-apps`).
- Общий flow create-app — `tools/lib/create-app-shell.js`; generators — только в тулчейне.
- Не восстанавливать `create:package` / обязательный `src/` в packages.
- Не включать webpack только ради folder-packages.
- Не восстанавливать root `pnpm-workspace` / `check-pnpm`.

## Команды

| Сценарий | Входная точка |
|----------|----------------|
| Nest app | `cd nestjs-apps && npm run create:app` |
| Vite app | `cd vite-apps && npm run create:app` |
| Docker | `npm run docker:create-compose`, `npm run docker:*` |
| Deps | `npm install` в тулчейне; после clone — `npm run deps:install` (три независимых install) |
