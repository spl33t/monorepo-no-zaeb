---
name: monorepo-modules-imports
description: >-
  Sub-monorepos nestjs-apps / vite-apps (each npm workspaces). Toolchain roots
  hold framework deps; apps are thin. packages/ is free-form shared code (not
  libraries).   Resolve @monorepo/* via Vite alias / Nest tsc. CLI via
  @monorepo/nest-cli | @monorepo/vite-cli.
---

# Модули и импорты

| Корень | Роль |
|--------|------|
| `nestjs-apps/` | npm workspaces: `apps/*` + `tools/nest-cli`; Nest deps |
| `vite-apps/` | npm workspaces: `apps/*` + `tools/vite-cli`; React/Vite deps |
| `tools/` | глобальные утилиты (root `npm install`) |

## Install

```bash
cd nestjs-apps && npm install
cd vite-apps && npm install
# или с корня: npm run deps:install
```

## `packages/`

Не библиотеки и не workspace-пакеты. Папку создаёшь руками.  
Импорт: `import { … } from '@monorepo/foo'`.

- Vite → один `tsconfig.json` (extends тулчейн) + `extendsBaseConfig` из `vite.config.base.ts`
- Nest → `tsc` + `"rootDir": "../.."`; packages в dist только если импортированы
- CLI → `devDependency` `@monorepo/nest-cli` / `@monorepo/vite-cli` (не линковать корень тулчейна)

## Чеклист

1. App — из тулчейна: `npm run create:app` (package name `@apps/<folder>`)
2. Общий код — папка под `*/packages/`
3. Версии фреймворка — только корень тулчейна
4. Скрипты app: `npm run build -w @apps/<name>` из тулчейна
