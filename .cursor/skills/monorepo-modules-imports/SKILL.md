---
name: monorepo-modules-imports
description: >-
  Workspace imports (@monorepo/*) via glob paths (packages/*/src), Vite and
  tsdown/Rolldown. CLI-scaffolded apps already include correct tsconfig and
  aliases. Use when fixing imports or temptation to add per-package paths or
  workspace deps. Do not list @monorepo packages as app dependencies for linking.
---

# Модули и импорты в монорепозитории

## Суть подхода (важно)

**Внутренние пакеты `packages/*` не нужно прописывать в `dependencies` / `devDependencies` приложения** в виде `@monorepo/foo` или `workspace:*`, чтобы «подключить» код из монорепы. Связка **TypeScript `paths` + сборщик** (для фронта — **Vite**, для Node/Nest — **tsdown** на **Rolldown** с TypeScript-плагином) сама разрешает импорты с исходников. Это и есть задуманное преимущество шаблона: меньше дублирования манифестов и проще сценарий «импортнул — собралось».

## Glob и отсутствие ручной настройки

- Алиас **`@monorepo/*` везде завязан на glob**: в типичном виде это **`packages/*/src`** (корень репо или относительно приложения — см. уже сгенерированные `tsconfig`). **Новый пакет** в `packages/<имя>/` автоматически попадает под этот паттерн — **отдельно прописывать каждый пакет в `compilerOptions.paths` или добавлять новые alias не нужно**.
- **Vite**: один alias на каталог `packages` (генератор), а не список пакетов по одному.
- Если приложение **создано через `pnpm create:app`**, то **`tsconfig` (и Vite-приложениях — `vite.config.ts`) уже настроены генератором**. Агенту **не предлагать** «добавить path/alias для `@monorepo/foo`» без веской причины: сначала проверь, что app не скопирован криво и что пакет лежит в `packages/<имя>/` с корректным `@monorepo/<имя>`.
- Ручная правка `paths` / `alias` уместна только в нестандартных случаях (например app завели **не** через CLI и конфиги не совпадают с `tools/generators/*`) — тогда ориентиром должен быть вывод генератора, а не разрастание списка алиасов на каждый импорт.

## Как импортировать workspace-код

- Имя пакета в `packages/<имя>/` публикуется как **`@monorepo/<имя>`** (см. генератор пакета).
- В коде используй **стабильный алиас**:

```typescript
import { hello } from '@monorepo/core';
import { Button } from '@monorepo/button';
```

- Резолв обеспечивают **уже заданные** glob-`paths` и сборщики (Vite / tsdown+Rolldown), а не пер-записи в `package.json` приложения.

Агенту: **не предлагай** добавить `@monorepo/…` в `apps/<app>/package.json` только ради импорта и **не плодить** новые path/alias под каждый новый пакет — проверь имя каталога и `packages/*/src`.

## Что не относится к «лишним» зависимостям

**Внешние npm-модули** (например `react`, `@nestjs/common`, `vite`) по-прежнему должны жить там, где код реально их использует: в **`dependencies` / `devDependencies` приложения** или **внутреннего пакета** в `packages/<имя>/package.json`, если логика пакета от них зависит. Правило выше про «не тянуть packages в app» относится **только к внутренним workspace-пакетам `@monorepo/*`**, а не к библиотекам из npm.

## Краткий чеклист для агента

1. Новый общий код — по возможности в **`packages/<имя>/`**, импорт в app — `@monorepo/<имя>` (glob уже покрывает все `packages/*`).
2. **Не** добавлять `@monorepo/<имя>` в `package.json` приложения для линковки с соседним пакетом.
3. **Не** дописывать вручную `paths` / Vite `alias` под каждый новый пакет, если конфиг как у CLI-сгенерированного приложения.
4. Имя в импорте должно совпадать с именем каталога и с полем `name` в `packages/<имя>/package.json` (`@monorepo/<имя>`).
5. После добавления **нового** пакета — при необходимости `pnpm install` с корня (воркспейс); это не замена пункту 2 и не повод править tsconfig ради glob.
6. Локальные алиасы приложения **`@/`** → `src/*` (в шаблоне из CLI); не путать с **`@monorepo/`**.

## Антипаттерны

- Ставить **`workspace:*`** на `@monorepo/...` в app «для надёжности», если задача только в импорте исходников — в этом шаблоне это лишнее.
- Расширять **`paths`** / **`alias`** списком вида «пакет A, пакет B…» вместо опоры на **`packages/*`** — ломает задумку шаблона.
- Импортировать файлы соседнего пакета **относительными путями** через границу `apps` → `packages` (`../../../packages/foo/...`), если достаточно `@monorepo/foo` — хуже согласованность и ломается идея единого алиаса.

## Где смотреть в репо (эталон для генераторов, не чеклист ручных правок)

- Корневой glob: `tsconfig.json` → `@monorepo/*` → `packages/*/src`.
- Vite: `tools/generators/vite-config.js` — alias на **`packages`**, не на каждый пакет.
- Node/Nest: `tools/generators/node.js`, `tools/generators/tsdown-config.js`.
