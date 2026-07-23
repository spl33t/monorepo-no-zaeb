---
name: monorepo-modules-imports
description: >-
  Sub-monorepos nestjs-apps / vite-apps (each npm workspaces). Toolchain roots
  hold framework deps; apps are thin. Folder packages (not npm libraries):
  root packages/ via @root-packages/*, */packages via @toolchain-packages/*.
  CLI-бины (nest/vite) и VAR=VAL (cross-env) резолвятся из toolchain-root/root deps —
  npm run сам поднимает node_modules/.bin каждого предка в PATH, без шимов/обёрток.
---

# Модули и импорты

| Корень | Роль |
|--------|------|
| `nestjs-apps/` | npm workspaces: `apps/*`; Nest deps (включая `@nestjs/cli`) |
| `vite-apps/` | npm workspaces: `apps/*`; React/Vite deps (включая `vite`) |
| `packages/` | isomorphic free-form → `@root-packages/*`; deps в root `package.json` |
| `*/packages/` | тулчейн-only → `@toolchain-packages/*` |
| `tools/` | глобальные утилиты (root `npm install`) |

## Install

```bash
npm run deps:install
```

Скрипт без флагов: ставит корни, у которых есть `package.json`; в Docker/CI → `npm ci`; при `NODE_ENV=production` → `--omit=dev`.  
`cross-env` — root `dependencies` (резолвится в apps без префиксов: `npm run` сам поднимает `node_modules/.bin` каждого предка на диске в PATH); `yaml` — root `devDependencies` (compose на хосте).

## Folder packages

Не библиотеки и не workspace-пакеты. Папку создаёшь руками.

| Alias | Путь |
|--------|------|
| `@root-packages/foo` | `packages/foo` |
| `@toolchain-packages/foo` | `nestjs-apps\|vite-apps/packages/foo` |

- Vite → `tsconfig` paths + `extendsBaseConfig` (`vite.config.base.ts`)
- Nest → classic: `nest build` (TS 6); Nestia: `ttsc` + deps на app (TS 7); `rootDir` = monorepo root
- Nestia SDK: `--project ../../tsconfig.nestia-sdk.json` (файл в `nestjs-apps/`)
- Docker build context = **корень монорепо**
- create:app: `--kind nestjs` | `nestia`
- CLI-бины (`nest`, `vite`, `tsc`) — просто deps toolchain-root, резолвятся hoisting'ом, апп ничего доп. не объявляет

## Чеклист

1. App — из тулчейна: `npm run create:app` (package name `@apps/<folder>`)
2. Isomorphic — `packages/<name>/` + `@root-packages/…`; toolchain — `*/packages/` + `@toolchain-packages/…`
3. Версии фреймворка — корень тулчейна; isomorphic deps — root
4. Скрипты app: `npm run build -w @apps/<name>` из тулчейна
