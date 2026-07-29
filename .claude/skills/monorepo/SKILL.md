---
name: monorepo
description: >-
  Single pnpm workspace (pnpm-workspace.yaml: apps/* + packages/*). Flat apps/ —
  app kind (nest|vite) lives in package.json → monorepo.kind, not folder
  location. packages/<name> are REAL pnpm workspace:* packages (via
  create:package, not manual folders), no build step — main/exports point at
  src/index.ts. Dependency versions centralized via pnpm catalogs (named only:
  catalog:shared/nest/vite — no default catalog:). Scaffold/remove apps and
  packages via tools/cli/*.js, NOT by hand or rm -rf — remove:app/remove:package
  also strip docker-compose entries and workspace:* references. Covers: repo
  structure, imports/catalogs, CLI commands, Nest's webpack builder quirks,
  Nestia SDK generation, Docker. Editing tools/ itself (not just using it) is
  gated on git origin — see warning at top of body.
---

# Монорепозиторий

> ⚠️ **Код в `tools/` (и его документацию — этот файл, `tools/README.md`) менять можно ТОЛЬКО если origin текущего репозитория — `https://github.com/spl33t/monorepo-no-zaeb`.** Перед любой правкой `tools/*` — проверить `git remote get-url origin`. Другой origin = это уже склонированная/форкнутая копия шаблона под конкретный проект, зафиксированная версия — тулинг в ней **используется** (`create:app`, `link:package`, `docker-compose-manager` и т.п.), но не модифицируется. Если пользователь просит поменять сам тулинг не в репозитории-шаблоне — уточнить, действительно ли он этого хочет, объяснив, что это разойдётся с шаблоном.

## Структура

| Путь | Роль |
|------|------|
| `apps/<name>/` | приложение; тип — `package.json` → `monorepo.kind: 'nest'\|'vite'`, НЕ расположение папки |
| `packages/<name>/` | реальный pnpm-пакет (`workspace:*`), без build-шага — `main`/`exports` → `src/index.ts` |
| `tools/cli/` | create-app, remove-app, create-package, remove-package, link-package, docker-compose-manager, create-docker-compose, kill-port, dev/build (`run-script.js`) |
| `tools/lib/` | `create-app-shell`, `monorepo-layout`, `docker-compose-parser` |
| `tools/generators/` | `nest/`, `vite/`, `package/`, `shared/` (общие Docker-стадии) — шаблоны для scaffold |

Один pnpm workspace, один install, один lockfile. `cross-env` — root `devDependency` (pnpm сам добавляет `<root>/node_modules/.bin` в PATH для скриптов любого app, без явного объявления). `yaml` — тоже root `devDependency` (docker-compose-тулинг на хосте). `@inquirer/prompts` — весь интерактив в `tools/cli/*.js` (select/checkbox/confirm/input), не ручной `readline`; ESM-only с v8, грузится динамическим `import()` из CommonJS. Turborepo в проекте нет — убран (создавал гонку рестартов с внутренним webpack-watcher'ом Nest CLI); `pnpm run dev`/`build` идут напрямую через `pnpm --filter`/`pnpm -r run`.

## Команды

| Сценарий | Команда |
|----------|---------|
| Новый app | `pnpm run create:app -- --kind nest\|react\|vanilla --name <name> [--port N] [--no-install]` |
| Новый пакет | `pnpm run create:package -- <name> [--no-install]` (интерактивно в конце предложит подключить к app'ам/пакетам) |
| Подключить пакет | `pnpm run link:package -- <app> <package...> [--kind nest\|vite] [--no-install]` (без аргументов — интерактивный мультиселект: куда + какие) |
| Удалить app | `pnpm run remove:app -- <name> [--kind nest\|vite] [--yes]` (интерактивно — мультиселект) |
| Удалить пакет | `pnpm run remove:package -- <name> [--yes]` (интерактивно — мультиселект) |
| Dev/Build | `pnpm run dev [name]` (без имени — интерактивный выбор), `pnpm run build [name]` (без имени — все apps) |
| Docker | `pnpm run docker:create-compose`, `pnpm run docker:compose-manager` (статус + актуальность + запуск), `pnpm run docker:*` |
| Deps | `pnpm run deps:install` (= `pnpm install`, без флагов — CI/`--frozen-lockfile` детектится сам) |

Все команды без аргументов — интерактивные (кроме `build`, который без имени собирает всё сразу — это безопасно, не держит порты). Параметры ясны — one-liner с `--`. Неясно — говорить пользователю запустить интерактивный скрипт самому. Не выводить весь `--help` в чат — ссылаться на `--help` / `tools/README.md`.

**Не создавать app/package руками или через `rm -rf`.** `create:package`/`create:app` пишут корректный `package.json` (catalog-ссылки, `monorepo.kind`). `remove:app`/`remove:package` также снимают сервис из `docker-compose.yml` и (для пакетов) `workspace:*`-ссылки из всех зависимых `package.json` — импорты в коде (`import ... from '@packages/<name>'`) не трогают, это руками.

## packages/* — настоящие workspace-пакеты

`package.json`: `main`/`types`/`exports` → `src/index.ts` напрямую, build-шага нет. Собственные npm-зависимости пакета — обычный `dependencies` в его `package.json`, резолвятся изолированно от потребителя (проверено живьём: `dayjs`, поставленный только пакету, резолвится и у Nest, и у Vite при полном отсутствии в `node_modules` обоих app'ов). Пакеты могут зависеть друг от друга через `workspace:*`.

- **Vite** — резолвит и транспайлит `src/index.ts` нативно (esbuild/Rollup), без настройки.
- **Nest** — через webpack-билдер приложения (см. ниже) — по умолчанию экстернализовал бы `@packages/*` вместо бандлинга.

## Nest: только webpack-билдер, не дефолтный tsc

Единственный вариант Nest-приложения — Nestia + typia (`--kind nest`, без под-выбора). Дефолтный tsc-билдер Nest CLI крашится на сыром `.ts`-пакете (`transformBundle`, ts-patch/typia) — поэтому `nest-cli.json` форсирует `webpack: true` + `webpackConfigPath: 'webpack.config.js'`.

`webpack.config.js` (генерируется автоматически) — 4 доработки дефолтного конфига `@nestjs/cli`, каждая обоснована в самом файле:
1. `nodeExternals({ allowlist: [/^@packages\//] })` — иначе `@packages/*` экстернализуется вместо бандлинга, и его `require()` в рантайме идёт мимо ts-patch/typia (`NoTransformConfigurationError`).
2. `ts-loader`'s `transpileOnly: false` — без этого typia/`@nestia/core`-трансформ не применяется вообще.
3. `ts-loader`'s `ignoreDiagnostics: [6059]` — Program охватывает `apps/<name>/src` и реальный путь пакета одновременно, TS требует `rootDir` покрывать оба; диагностика чисто косметическая.
4. Фильтр `ForkTsCheckerWebpackPlugin` из `options.plugins` — вместе с п.2 давал двойной тайпчек на каждой сборке.

`@/*`-алиас в `tsconfig.json` работает "из коробки" (проверено живьём) — дефолтный webpack-конфиг `@nestjs/cli` уже включает `TsconfigPathsPlugin` (пакет `tsconfig-paths-webpack-plugin`, собственная зависимость `@nestjs/cli`) в `resolve.plugins`; наш `webpack.config.js` его не трогает, только дополняет. Не путать с npm-пакетом `tsconfig-paths` — другой пакет, нужен для ts-node/`nestia sdk` (см. ниже), а не для webpack-резолва алиасов.

`rootDir` в `tsconfig.json` app'а — узкий, `'src'` (не корень монорепо), несмотря на то что Program формально включает и `packages/*/src`. `ts-patch` персистентно патчит `typescript` (`"prepare": "ts-patch install"`) — этим же патчем пользуется и `ts-loader`, и `nestia sdk` (идёт через ts-node, отдельный путь).

## pnpm catalogs — версии зависимостей

`pnpm-workspace.yaml` — единственное место, где версии npm-пакетов закреплены semver'ом. **Только именованные каталоги** — безымянный дефолтный `catalog:` не используется нигде в проекте.

- **`shared`** — пакет нужен больше чем одному `kind`, и версия не должна расходиться (`@types/node`, `typescript`).
- **`nest`/`vite`** — специфично одному kind'у, или версии обязаны отличаться.

Каталог vs голая версия в `package.json`: каталог — если зависимость используется больше чем в одном `package.json`; голая версия — если специфична одному конкретному пакету/app'у (пример: `dayjs` только в `packages/shared`, тащить в общий каталог ради одного места незачем).

Добавить зависимость в каталог — правишь только `pnpm-workspace.yaml`; генераторы уже ссылаются по имени (`catalog:nest`, `catalog:vite`, `catalog:shared`), новый app получает актуальную версию автоматически.

## Зависимости apps/nest — что явно, а что нет

Правило: пакет обязан быть в `dependencies`, если СКОМПИЛИРОВАННЫЙ код `apps/<name>/src` напрямую его `require()`'ит (например `typia` — `@nestia/core`'s transform вставляет `require('typia/lib/internal/...')` прямо в транспилированный код). Если пакет нужен только ВНУТРИ другой зависимости (её собственный код, её собственный `node_modules`) — необязателен явно, pnpm дедуплицирует его в один физический экземпляр (проверено живьём для `@nestia/fetcher`, `reflect-metadata`).

**Исключение — `@nestjs/platform-express`.** `@nestjs/core` объявляет его ОПЦИОНАЛЬНЫМ `peerDependency` (наравне с обязательными `reflect-metadata`/`rxjs`). Peer-зависимости pnpm резолвит per-context: разный набор явных deps у разных потребителей может дать РАЗНЫЕ физические экземпляры одного и того же `@nestjs/core` в `.pnpm`-store, и не у каждого экземпляра platform-express окажется соседом. `NestFactory.create()` без явного адаптера делает динамический `require('@nestjs/platform-express')` — если резолвится "не тот" экземпляр, падение в рантайме: `No driver (HTTP) has been selected` (проверено живьём: свежий scaffold без явного platform-express не поднимался; возврат в `dependencies` чинит резолв). Обычная дедупликация, на которую опирается правило выше, работает только для НЕ-peer зависимостей — поэтому `@nestjs/platform-express` явно в `dependencies`, хотя наш код его не импортирует.

То же для build-time: `ts-loader` и `webpack-node-externals` — явные `devDependencies`, потому что webpack резолвит их (`require('webpack-node-externals')` в `webpack.config.js`, строку `'ts-loader'` как имя loader'а) от `apps/<name>/node_modules` — без этого `Module not found`. `tsconfig-paths` не нужен — `@nestia/sdk` теперь сам его зависимость.

## Nestia SDK → packages/<name>-api

`apps/<name>/nestia.config.ts` (генерируется автоматически) целится в `packages/<name>-api/src` — при первом `pnpm run sdk` создаёт сам пакет (`package.json` с `@nestia/fetcher` + `typia`), дальше только перезаписывает `src/`. Если DTO контроллера — тип из другого `@packages/*` (например `@packages/shared`), nestia эмитит `import type` на него — стирается при сборке, но tsc потребителя всё равно должен резолвить модуль при тайпчеке. Поэтому `nestia.config.ts` после каждой генерации сам сканирует `src/**/*.ts` на `@packages/*`-импорты и дописывает найденное в `dependencies` (`workspace:*`, идемпотентно — повторный `pnpm run sdk` без изменений в API ничего не трогает).

## Docker

5 стадий (общие для nest/vite — `tools/generators/shared/dockerfile-common.js`): `resolver` (`pnpm --filter "{apps/<name>}..." list --depth -1 --parseable` через bind-mount на `packages/`, копирует ТОЛЬКО реально нужные пакеты в `/needed` — не весь `packages/`) → `freshness` (манифесты + `apps/<name>` + `COPY --from=resolver /needed`, БЕЗ install/build — граница для дешёвой проверки актуальности) → `deps` (`FROM freshness`, `pnpm install --filter "{apps/<name>}..." --frozen-lockfile` под `--mount=type=cache` для pnpm store) → `builder` (`pnpm run build`) → `production` (node apps: `FROM deps`, `pnpm prune --prod`; vite apps: `FROM nginx:alpine`, только статика) → `development` (`FROM deps`, `pnpm run dev`/`vite`).

`--filter "{apps/<name>}..."` — обязательно с фигурными скобками, `./apps/<name>...` молча не резолвит workspace-зависимости (проверено живьём).

**Проверка актуальности** (`pnpm run docker:compose-manager`, всегда перед выбором сервисов): `docker build --target freshness --progress=rawjson`, без тега — канонический образ не трогается. `--progress=rawjson` — структурированный JSON от BuildKit (`client.Vertex.cached`) в stderr, не текстовый парсинг; проверяется последний vertex стадии `freshness` (cache-key каждого vertex включает digest'ы предыдущих — если что-то изменилось выше по цепочке, последний шаг тоже не `cached`). Реальный кэш Docker как источник истины, не приближение (git diff/mtime отклонены — не видят изменений в untracked-файлах). Работает на тёплом персистентном кэше (свой сервер/локально) — на эфемерных CI-раннерах кэш всегда холодный, нужна отдельная инфраструктура (registry cache и т.п.).
