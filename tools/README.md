# Инструменты монорепозитория

> ⚠️ **Этот файл и код в `tools/` можно менять ТОЛЬКО если origin текущего репозитория — `https://github.com/spl33t/monorepo-no-zaeb`** (проверить: `git remote get-url origin`). Другой origin означает, что это уже склонированная/форкнутая копия шаблона для конкретного проекта — зафиксированная версия, менять сам тулинг в ней нельзя (только пользоваться им: `create:app`, `link:package` и т.п.). Иначе правки тулинга разойдутся между шаблоном и его копиями и станут несовместимы.

```
apps/                  # плоско, тип app'а — package.json → monorepo.kind ('nest' | 'vite')
packages/               # настоящие workspace-пакеты (workspace:*, без build-шага — сырой src/)
tools/
  cli/                 # create-app, remove-app, create-package, remove-package, link-package,
                       # docker-compose-manager, create-docker-compose, kill-port, dev/build (run-script.js)
  lib/                 # create-app-shell, monorepo-layout, docker-compose-parser
  generators/
    nest/              # create-app, files, tsconfig, dockerfile, webpack-config
    vite/              # create-app, react-files, vanilla-files, vite-config, dockerfile
    package/           # create-package (raw source, без build-шага)
    shared/            # dockerfile-common — общие Docker-стадии nest- и vite-генераторов
```

Один pnpm workspace (`pnpm-workspace.yaml`, `packages: ['apps/*', 'packages/*']`), один install, один lockfile.

`cross-env` — root devDependency: pnpm сам добавляет `<workspace root>/node_modules/.bin` в PATH для скриптов любого app — резолвится без явного объявления в каждом `package.json`. `@inquirer/prompts` — тоже root devDependency: весь интерактив в `tools/cli/*.js` (select/checkbox/confirm/input) идёт через него, не через ручной `readline`. Пакет ESM-only с v8 — грузится динамическим `import()` из CommonJS-файлов (стандартный мост, без перевода `tools/` в ESM).

## Команды

| Сценарий | Команда |
|----------|---------|
| Новый app | `pnpm run create:app` (интерактивно) или `pnpm run create:app -- --kind nest\|react\|vanilla --name <name> [--port N] [--no-install]` |
| Новый пакет | `pnpm run create:package` (интерактивно, в конце предложит подключить к app'ам/пакетам) или `pnpm run create:package -- <name> [--no-install]` |
| Подключить пакет | `pnpm run link:package` (интерактивно, мультиселект: куда + какие пакеты) или `pnpm run link:package -- <app> <package...> [--kind nest\|vite] [--no-install]` |
| Удалить app | `pnpm run remove:app -- <name> [--kind nest\|vite] [--yes]` (без аргументов — интерактивный мультиселект) |
| Удалить пакет | `pnpm run remove:package -- <name> [--yes]` (без аргументов — интерактивный мультиселект) |
| Dev | `pnpm run dev` (интерактивный выбор) или `pnpm run dev <name>` → `pnpm --filter @apps/<name> run dev` |
| Build | `pnpm run build` (все apps, `pnpm -r run build`) или `pnpm run build <name>` (один app) |
| Освободить порт | `pnpm run kill:port` |
| docker-compose.yml | `pnpm run docker:create-compose` |
| Docker-менеджер | `pnpm run docker:compose-manager` — статус контейнеров + актуальность образов + запуск (см. [Docker](#docker)) |
| Установка | `pnpm run deps:install` (= `pnpm install`) |

`dev`/`build` без имени ведут себя по-разному: `dev` без аргумента спрашивает интерактивно, `build` без аргумента собирает всё (безопасно — сборка не держит порты, в отличие от dev).

Отдельного скрипта-обёртки для установки нет — pnpm сам детектит CI (`ci-info`) и по умолчанию ведёт себя как `--frozen-lockfile`. `--prod` в локальной установке не нужен — это Docker/deploy-специфика, см. [Docker](#docker).

`create:app`/`create:package`/`remove:app`/`remove:package`/`link:package` — все интерактивные шаги (выбор app'а/пакета, подтверждения) идут через `@inquirer/prompts`: `checkbox` для множественного выбора (ничего не предвыбрано по умолчанию — явный выбор), `select`/`confirm`/`input` для одиночных. `create:package` в интерактивном режиме переиспользует ту же логику выбора, что и `link:package` (`interactiveLink()`, экспортирована из `tools/cli/link-package.js`) — не дублирует её.

## packages/* — настоящие workspace-пакеты

`packages/<name>` — обычный pnpm-пакет: свой `package.json` (`"name": "@packages/<name>"`, `workspace:*` в зависимостях app'ов), **без build-шага** — `main`/`types`/`exports` указывают прямо на `src/index.ts`. Свои npm-зависимости пакет объявляет как обычно (`dependencies` в его собственном `package.json`) и резолвит их независимо — не завися от того, что установлено у app'а-потребителя (проверено живьём: `dayjs`, поставленный только пакету, корректно резолвится и у Nest, и у Vite, при этом отсутствуя в `node_modules` обоих app'ов).

### Как Vite и Nest резолвят packages/* (механика)

Оба начинают одинаково — обычный симлинк pnpm: `apps/<name>/node_modules/@packages/<pkg> → ../../../packages/<pkg>` (реальный путь). Оба резолвера следуют символьной ссылке до реального файла на диске (`resolve.symlinks` включён по умолчанию у обоих), а не останавливаются на самом симлинке — дальше пути расходятся.

**Vite (esbuild/Rollup)** — обрабатывает файл как часть графа модулей самого app'а: зависимостный оптимизатор (dev) или бандлер (build) транспайлит `.ts` на лету. Никакой отдельной настройки не требуется — Vite одинаково прозрачен что к сырому `src/`, что к собранному `dist/`.

**Nest (webpack)** — сложнее. Дефолтный конфиг Nest CLI ставит `externals: [nodeExternals()]`, который экстернализирует всё, что резолвится из `node_modules` (оставляет как `require()` для рантайма, не бандлит). Для сырого `.ts`-пакета это ломается: `require()` в рантайме попадает на нативный TypeScript type-stripping самого Node — а он не проходит через ts-patch/typia (`NoTransformConfigurationError` в рантайме, при том что билд-тайм тайпчек через `ts-loader` проходит чисто). Чинится в `apps/<name>/webpack.config.js` (генерируется автоматически, 4 доработки дефолтного конфига, каждая обоснована в самом файле):

1. `nodeExternals({ allowlist: [/^@packages\//] })` — форсирует настоящий бандлинг `@packages/*` вместо экстернализации, через тот же `ts-loader`/Program, что и у собственного кода app'а.
2. `ts-loader`'s `transpileOnly: false` — без этого typia/`@nestia/core`-трансформ не применяется вообще (ни к пакету, ни к самому app'у).
3. `ts-loader`'s `ignoreDiagnostics: [6059]` — Program теперь охватывает `apps/<name>/src` и реальный путь пакета одновременно, TS требует `rootDir` покрывать оба (иначе `TS6059`) — диагностика чисто косметическая (webpack не пишет файлы на диск с сохранением структуры), гасится точечно, `rootDir` остаётся узким (`src`).
4. Фильтр `ForkTsCheckerWebpackPlugin` из `options.plugins` — Nest CLI по умолчанию всегда добавляет второй, отдельный тайпчекер в форкнутом процессе; вместе с `transpileOnly: false` (пункт 2) это давало двойной тайпчек на каждой сборке — убрано.

`options.devtool = 'source-map'` и `options.cache = { type: 'filesystem' }` там же — не про `packages/*` напрямую, но обе тоже входят в стандартный сгенерированный конфиг (сорсмапы для читаемых стектрейсов + персистентный кэш webpack, ускоряет холодный старт `nest build`/`--watch` в разы).

`@/*`-алиас в `tsconfig.json` работает без доп. настройки — дефолтный webpack-конфиг `@nestjs/cli` уже включает `TsconfigPathsPlugin` (`tsconfig-paths-webpack-plugin`, собственная зависимость `@nestjs/cli`) в `resolve.plugins`, наш `webpack.config.js` его не трогает (проверено живьём).

### Nestia SDK → packages/<name>-api (автоматически)

`apps/<name>/nestia.config.ts` (генерируется для каждого nest-app'а) не просит указать `SDK_OUTPUT` руками — он сам целится в `packages/<name>-api/src` и при первом запуске `pnpm run sdk` (`nestia sdk --project tsconfig.json`) создаёт сам пакет: `packages/<name>-api/package.json` (`"name": "@packages/<name>-api"`, `main`/`types`/`exports` → `src/index.ts`, тот же raw-source-паттерн, что у любого `packages/*`) с базовыми зависимостями `@nestia/fetcher` + `typia`. Дальше `nestia sdk` просто перезаписывает файлы в `src/`, `package.json` не трогает — сгенерированный клиент становится обычным `workspace:*`-пакетом, который любой app (в т.ч. Vite) подключает как рядовую зависимость.

Есть нюанс: если DTO контроллера — тип, объявленный в другом `@packages/*` (например `@packages/shared`), nestia честно эмитит `import type { X } from "@packages/shared"` в сгенерированном клиенте. Стирается при сборке, но tsc потребителя всё равно должен резолвить модуль на этапе тайпчека — без явной зависимости это `TS2307: Cannot find module` у любого app'а, который подключил только `@packages/<name>-api` (проверено живьём: именно так ведёт себя golden-пример — `AppController.getHello()` возвращает `Greeting` из `@packages/shared`). Поэтому `nestia.config.ts` после каждой генерации сам сканирует `packages/<name>-api/src/**/*.ts` на `@packages/*`-импорты и дописывает найденное в `dependencies` (`workspace:*`) — правки идемпотентны, повторный `pnpm run sdk` без изменений в API ничего не трогает.

## pnpm catalogs — версии зависимостей

`pnpm-workspace.yaml` — единственное место, где версии реальных npm-пакетов закреплены буквальным semver. Ни один `package.json` не должен содержать голую version-строку для зависимости, которая используется больше чем в одном месте (или предсказуемо будет).

**Только именованные каталоги** (`catalogs.<name>:`) — безымянный дефолтный `catalog:` не используется, чтобы `"catalog:shared"` в `package.json` было явным и самодокументируемым, а не голым `"catalog:"`, который непонятен без похода в `pnpm-workspace.yaml`. Сейчас три каталога:

- **`shared`** — пакет используется больше чем одним `kind`, и версия заведомо не должна расходиться между ними (`@types/node`, `typescript`).
- **`nest` / `vite`** — специфично одному kind'у, ИЛИ пакет с тем же именем нужен обоим, но версии обязаны отличаться.

Принцип разделения — не "какие пакеты называются одинаково", а обязана ли версия быть единой. `typescript` изначально был раздельным (`nest`: `^6.0.3`, `vite`: `~5.7.2`) — казалось, что версии обязаны расходиться, но реальной технической причины не было, это унаследованная от скаффолда версия, а не осознанное ограничение. Проверено живьём (реальный `--kind react` app, `tsc` + `vite build` + dev-режим, с `@packages/*`-зависимостью) — `^6.0.3` работает под Vite так же чисто, как под Nest. Смёржено в `shared`. Мораль: если сомневаешься, разошлись ли версии специально или просто исторически — проверь, не принимай на веру.

**Каталог vs голая версия в `package.json`**: каталог — если зависимость используется больше чем в одном `package.json` (с общей или per-kind версией, см. выше), либо это часть стандартного стека для kind'а. Голая версия — если зависимость специфична одному конкретному пакету/app'у и вряд ли понадобится где-то ещё (пример: `dayjs` в `packages/shared` — единственный потребитель, тащить её в общий каталог ради одного места незачем).

**Как добавить новую зависимость в каталог**: правишь только `pnpm-workspace.yaml`. Генераторы (`tools/generators/nest|vite/create-app.js`) уже ссылаются на `catalog:nest`/`catalog:vite` по имени пакета — новый app получает актуальную версию автоматически, руками её в генераторе не прописывают.

**Форматирование `pnpm-workspace.yaml`**:
- Ключи внутри каждого каталога — по алфавиту (ASCII-сортировка: дефис `-` идёт раньше букв, поэтому `ts-loader` < `ts-patch`).
- В кавычки — только имена, начинающиеся с `@` (scoped-пакеты; `@` — зарезервированный символ в YAML). `ts-loader`, `dotenv` и т.п. — без кавычек, они не нужны.

**Проверка целостности**: каждая `catalog:*`-ссылка в генераторах и в реальных `apps/*`/`packages/*` `package.json` обязана иметь соответствующую запись в `pnpm-workspace.yaml` — иначе `pnpm install` падает на нерезолвящемся каталоге.

### Зависимости apps/nest — что явно, а что нет

Правило: пакет обязан быть в `dependencies`, если СКОМПИЛИРОВАННЫЙ код `apps/<name>/src` напрямую его `require()`'ит (резолвится от `apps/<name>/node_modules`) — например `typia`: transform `@nestia/core` вставляет `require('typia/lib/internal/...')` прямо в транспилированный `app.controller.ts`. Если пакет нужен только ВНУТРИ какой-то другой зависимости (её собственный код, её собственный `node_modules`) — необязателен явно: pnpm дедуплицирует такие пакеты в один физический экземпляр в `.pnpm`-store независимо от того, объявлен ли он у нас явно (проверено живьём для `@nestia/fetcher`, `reflect-metadata`).

**Исключение — `@nestjs/platform-express`.** `@nestjs/core` объявляет его опциональным `peerDependency` (наравне с обязательными `reflect-metadata`/`rxjs`). Peer-зависимости pnpm резолвит per-context: разный набор явных deps у разных потребителей может дать разные физические экземпляры одного и того же `@nestjs/core` в `.pnpm`-store, и не у каждого экземпляра platform-express окажется соседом. `NestFactory.create()` без явного адаптера делает динамический `require('@nestjs/platform-express')` — если резолвится "не тот" экземпляр, падение в рантайме: `No driver (HTTP) has been selected` (проверено живьём: свежий scaffold без явного platform-express не поднимался; возврат в `dependencies` чинит резолв). Обычная дедупликация выше работает только для НЕ-peer зависимостей — поэтому `@nestjs/platform-express` явно в `dependencies`, хотя наш код его не импортирует.

То же правило для build-time: `ts-loader` и `webpack-node-externals` — явные `devDependencies`, потому что наш собственный `webpack.config.js` напрямую делает `require('webpack-node-externals')`, а webpack сам резолвит строку `'ts-loader'` из `nest-cli.json` как имя loader'а — оба резолвятся именно от `apps/<name>/node_modules`, без explicit deps сборка падает с "Module not found". `tsconfig-paths` не нужен — `@nestia/sdk` теперь сам зависит от `tsconfig-paths` в своём `package.json`, дублировать незачем.

### Конфиги app'ов самодостаточны

Конфиги (`tsconfig.json`, `vite.config.ts`) каждого app'а — полностью самодостаточные, генератор инлайнит их целиком. Раньше были shared-базы в `tools/` (`tools/tsconfig.nest.json` и т.п.) с `extends` — убрано: это чистые статические данные, а DRY даёт сам генератор (JS-функция), не runtime-файл. Локальность (весь конфиг app'а виден в одном файле) важнее гипотетического "поменять всем сразу".

## Почему не Turborepo

Стоял здесь раньше специально ради `interruptible: true` — Nest CLI watcher видел только свой `src/`, не `packages/*`, и без турбо правка пакета не рестартила dev.

Когда Nest-генератор перешёл на webpack-билдер (`apps/<name>/webpack.config.js`), его собственный watcher стал сам подхватывать правки в workspace-пакетах через symlink — необходимость в турбо-рестарте отпала. Хуже того: когда оба супервизора (турбо и внутренний webpack-watcher Nest CLI) работали одновременно, они независимо реагировали на одно и то же изменение файла и **гонялись за перезапуском одного процесса** — поймано живьём:

- несколько одновременно живых `dist/main`;
- падение с `Cannot find module dist/main` (второй supervisor удалял `dist/` прямо во время старта, инициированного первым);
- случайный `EADDRINUSE`.

Build-кэш турбо (граф из `workspace:*`, а не из наличия build-таска — тоже проверено, что инвалидируется корректно даже для пакетов без своей сборки) был реальной пользой, но при текущем масштабе (у пакетов вообще нет build-шага — нечему кэшироваться) её перекрывает `pnpm -r run build`, который делает то же самое нативно, без лишней зависимости.

## Docker

Per-app Dockerfile (генерируется `tools/generators/nest|vite/dockerfile.js`, общие стадии — `tools/generators/shared/dockerfile-common.js`) — build context корень монорепо, 5 стадий:

- **`resolver`** — вычисляет через сам pnpm (`pnpm --filter "{apps/<name>}..." list --depth -1 --parseable` — реальное транзитивное замыкание графа воркспейса, plain-текст путей, без JSON) какие `packages/*` реально нужны ЭТОМУ app'у, и копирует только их в `/needed`. Доступ к `packages/` — через `--mount=type=bind` (без материализации в свой слой, единственная реальная запись на диск — `cp` уже отобранных пакетов). Резолвер — не только про размер образа, а про точность freshness-проверки (см. ниже): без него правка ПОСТОРОННЕГО пакета ложно помечала бы образ устаревшим (проверено живьём).

  `./apps/<name>...` (без фигурных скобок) в `--filter` — **не работает**: суффикс `...` у pnpm официально комбинируется с `{<dir>}`, а не с `./<dir>` — с `./` он молча не находит workspace-зависимостей (проверено живьём).

- **`freshness`** — копирует манифесты, сам `apps/<name>` (не весь `apps/` — раньше копировался целиком, образ каждого app'а тащил чужие исходники) и отфильтрованные resolver'ом `packages/*` через `COPY --from=resolver`. Ничего не устанавливает и не собирает — это намеренная стадия-граница ДО дорогого `RUN pnpm install`, точка дешёвой проверки актуальности (`docker build --target freshness --progress=rawjson`, доли секунды при полном кэше — см. ниже).
- **`deps`** (`FROM freshness`) — `pnpm install --filter "{apps/<name>}..." --frozen-lockfile` под `--mount=type=cache,id=pnpm,target=/pnpm/store` (персистентный store — полная переустановка не тянет пакеты из сети повторно, проверено живьём: 117s → 29s).
- **`builder`** (`FROM deps`) — `pnpm run build`.
- **`production`** (`FROM deps`, node-based apps) — `pnpm prune --prod` над уже готовым `node_modules` из `deps` (не отдельный `install --prod` с нуля — экономит время и трафик, lifecycle-скрипты не перезапускаются, `--ignore-scripts` не нужен) + забирает `dist` из `builder`. Vite-приложения — `production` вместо этого `FROM nginx:alpine`, раздаёт статику из `builder`, `node_modules` в этот образ вообще не попадает.
- **`development`** (`FROM deps`) — `pnpm run dev`/`vite`.

`.env` намеренно в `.dockerignore` — не попадает в образ. `vite.config.ts`'s `portFromEnv()` из-за этого не должен падать без него (production/nginx-статике PORT вообще не нужен) — при отсутствии файла тихо берёт `process.env.PORT` (docker-compose `env_file`/`docker run -e`) или дефолт, не бросает исключение.

### Проверка актуальности образов

`pnpm run docker:compose-manager` перед выбором сервисов всегда (без отдельного вопроса — проверка дешёвая и не имеет опасных побочных эффектов) гоняет `docker build --target freshness --progress=rawjson` для каждого сервиса, без тега (`-t` не передаётся — канонический `<project>-<service>` образ не трогается вообще).

`--progress=rawjson` — реальный структурированный вывод BuildKit (сериализация `client.Vertex`, поле `cached: bool`), не парсинг текстового прогресса для человека — пишется в **stderr** процесса `docker build` (проверено живьём). Проверяется ПОСЛЕДНИЙ vertex стадии `freshness` (по имени `[freshness N/N]`): у каждого vertex в cache-key входят digest'ы предыдущих шагов, так что если изменилось ЛЮБОЕ upstream-`COPY` (исходники app'а ИЛИ отфильтрованные resolver'ом `packages/*`), последний шаг тоже перестаёт быть `cached` — проверять каждый `COPY` по отдельности не нужно (проверено живьём).

Это не приближение (в отличие от git diff/mtime/самодельного хэша — все рассматривались и отклонены): `COPY`'s cache-key в BuildKit и есть content-hash скопированных файлов, вопрос "изменились ли исходники" задаётся Docker'у напрямую. Единственное ограничение — механизм опирается на **тёплый, персистентный** кэш BuildKit: на постоянном хосте (свой сервер, локальная разработка) работает как задумано, на эфемерных CI-раннерах (каждый запуск — чистая машина) кэш каждый раз холодный и `changed: true` будет всегда — там нужна отдельная инфраструктура (registry cache, `type=gha` и т.п.), которой в этом проекте нет.

Менеджер (`tools/cli/docker-compose-manager.js`) после проверки показывает список сервисов (статус контейнера + актуальность) и три стратегии запуска: ручной выбор (чекбокс), все неактуальные, все.
