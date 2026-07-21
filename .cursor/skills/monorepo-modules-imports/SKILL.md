---
name: monorepo-modules-imports
description: >-
  Workspace imports (@monorepo/*) via glob paths (packages/*/src), Vite and
  ttsc. Node apps: after emit, node-run junctions package node_modules into
  dist so npm deps stay isolated. Do not list @monorepo packages as app
  dependencies for linking. Use when fixing imports or temptation to add
  per-package paths or workspace deps.
---

# Модули и импорты в монорепозитории

## Суть подхода (важно)

**Внутренние пакеты `packages/*` не нужно прописывать в `dependencies` / `devDependencies` приложения** в виде `@monorepo/foo` или `workspace:*`, чтобы «подключить» код из монорепы. Связка **TypeScript `paths` + сборщик** (для фронта — **Vite**, для Node/Nest — **ttsc** emit) сама разрешает импорты с исходников.

## Два слоя резолва (Node/Nest)

### 1. `@monorepo/*` — compile-time

- Glob `paths`: `@monorepo/*` → `packages/*/src` (в app/IDE `tsconfig`).
- **`node-run` сам пишет effective tsconfig** для emit: `rootDir` = корень монорепы (`findMonorepoRoot`), в `plugins` всегда `@ttsc/paths`, из paths автоматом только `@/*` → `./src/*`. Алиасы вроде `@monorepo/*` — **вручную** в app `tsconfig.json`.
- Зеркало в `dist/...` (например `dist/packages/core/...`); в emit алиас → относительный `require`.

### 2. npm-зависимости пакетов — runtime (вариант A)

Deps (`dayjs`, …) объявляются в **`packages/<имя>/package.json`**, живут в `<пакет>/node_modules`.

После emit код лежит в `dist/<rel>/...`. **`node-run`** после emit делает junction/symlink:

`dist/<rel>/node_modules` → `<monorepoRoot>/<rel>/node_modules`

для каждого зеркала, у которого на корне есть `package.json` + `node_modules` (не только папка `packages/`).

Обычный Node-walk даёт **ту же изоляцию версий**, что у исходного пакета. Не опираться на `NODE_PATH` от pnpm `.bin`.

Подробности: [`tools/node-run/ARCHITECTURE.md`](../../tools/node-run/ARCHITECTURE.md).

## Glob и отсутствие ручной настройки

- Алиас **`@monorepo/*`** — glob **`packages/*/src`**. Новый пакет попадает под паттерн без правок `paths`.
- **Vite**: один alias на каталог `packages`.
- CLI-сгенерированные app уже имеют корректный `tsconfig` / Vite config.

## Как импортировать workspace-код

```typescript
import { hello } from '@monorepo/core';
import { Button } from '@monorepo/button';
```

## Что не относится к «лишним» зависимостям

**Внешние npm-модули** живут в app или в **`packages/<имя>/package.json`**. Правило «не тянуть `@monorepo/*` в app» — только про внутренние пакеты.

## Краткий чеклист для агента

1. Общий код — в `packages/<имя>/`, импорт — `@monorepo/<имя>`.
2. **Не** добавлять `@monorepo/<имя>` в `package.json` app только ради линковки.
3. **Не** плодить `paths` / alias на каждый пакет при CLI-конфиге.
4. Имя импорта = каталог = `name` в манифесте пакета.
5. Node app: `dev`/`build`/`start` через `node-run` (линкует `node_modules` в dist).
6. Локальный `@/` → `src/*`; не путать с `@monorepo/`.

## Антипаттерны

- `workspace:*` на `@monorepo/...` в app «для надёжности» при paths+emit — лишнее для текущего контракта.
- Список `paths` вместо `packages/*`.
- Относительные импорты `apps` → `packages` вместо `@monorepo/foo`.
- Полагаться на `NODE_PATH` / require-hook вместо junction в dist.
- Голый `node dist/...` без предварительного `node-run build` (без ссылок на `node_modules`).

## Где смотреть

- Корневой glob: `tsconfig.json` → `@monorepo/*` → `packages/*/src`.
- Vite: `tools/generators/vite-config.js`.
- Node/Nest: `tools/generators/node.js`, `tools/generators/tsconfig-build.js`; runtime — `@monorepo/node-run` + [`ARCHITECTURE.md`](../../tools/node-run/ARCHITECTURE.md).
