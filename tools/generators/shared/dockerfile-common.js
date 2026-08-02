/**
 * `resolver` + `freshness` + `deps` — общие для nest- и vite-генераторов
 * Dockerfile-стадии (побайтово одинаковые кроме appName, было продублировано
 * в обоих генераторах, вынесено сюда).
 *
 * `resolver` — вычисляет через сам pnpm (`--filter "{apps/<name>}..." list
 * --depth -1 --parseable` — реальное транзитивное замыкание графа воркспейса,
 * plain-текст путей, без JSON) какие packages/* реально нужны ЭТОМУ app'у, и
 * копирует только их в `/needed`. Резолвер — не только про размер образа, а
 * про точность freshness-проверки (см. `freshness` ниже): без него правка
 * ПОСТОРОННЕГО пакета (от которого app не зависит) ложно помечала бы образ
 * устаревшим — проверено живьём. `./apps/<name>...` (без фигурных скобок) —
 * не работает: суффикс `...` у pnpm официально комбинируется с `{<dir>}`,
 * а не с `./<dir>` — с `./` он молча не находит workspace-зависимостей.
 *
 * `packages/` резолверу доступен через `--mount=type=bind` — БЕЗ материализации
 * в его собственный слой (mount не персистентен, пропадает по завершении RUN),
 * единственная реальная запись на диск — `cp` уже отобранных пакетов в
 * `/needed`. `apps/<name>` резолверу, наоборот, копируется реальным `COPY`, но
 * только `package.json` — `pnpm list` больше ничего оттуда не читает; копировать
 * туда весь app было бы лишней материализацией (тот же app ещё раз копируется
 * ниже, в `freshness`) без всякой пользы.
 *
 * `freshness` — стадия ДО `RUN pnpm install`, точка дешёвой проверки
 * актуальности: `docker build --target freshness --progress=rawjson` доходит
 * только до COPY-шагов (исходники app'а + отфильтрованные resolver'ом
 * packages/*) и останавливается — ни install, ни build не запускаются.
 * `--progress=rawjson` — реальный структурированный вывод BuildKit
 * (`client.Vertex` JSON, поле `cached: bool`), не текстовый парсинг —
 * проверено живьём, пишется в stderr процесса `docker build`. Проверять
 * достаточно ПОСЛЕДНИЙ vertex стадии (по имени `[freshness N/N]`, где N —
 * последний шаг): у каждого vertex в cache-key входят digest'ы предыдущих
 * шагов, так что если изменилось ЛЮБОЕ upstream-COPY, последний шаг тоже
 * перестаёт быть cached — проверять каждый COPY по отдельности не нужно
 * (проверено живьём). Логика самой проверки — в
 * tools/cli/docker-compose-manager.js, здесь только граница стадии.
 *
 * `deps` — `FROM freshness`, ставит зависимости под `--mount=type=cache` для
 * pnpm store (тот же паттерн, что в официальном pnpm.io/docker): полная
 * переустановка (правка реальной зависимости) — проверено живьём: 117s без
 * cache mount → 29s с ним (`reused 392, downloaded 0` в логе install — из
 * сети не тянется вообще ничего).
 *
 * `tools/packages/*` (root-уровня workspace-пакеты вроде `@tools/workspace-env`
 * — root-зависимость, не в графе конкретного app'а) копируются в `freshness`
 * ЦЕЛИКОМ, тем же путём, что и в резолвере не участвуют. Причина — не
 * "забыли", а обнаруженный живьём баг: `pnpm --filter "{apps/<name>}..."
 * list` не включает root-only зависимости в свой вывод (resolver их
 * физически не видит), а `pnpm install` тем не менее пытается их
 * слинковать — без реального `COPY` симлинк `node_modules/@tools/<name>`
 * внутри образа указывает в никуда (сам pnpm install не падает, но
 * `node_modules/.bin/<bin>` не создаётся вовсе — бинарник молча пропадает,
 * ошибка всплывает только в рантайме контейнера как "command not found").
 * @param {string} appName
 * @returns {string}
 */
function generateResolverAndDepsStages(appName) {
  return `FROM node:22-alpine AS resolver

RUN corepack enable
WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/${appName}/package.json ./apps/${appName}/package.json

RUN --mount=type=bind,source=packages,target=packages \\
    mkdir -p /needed && \\
    pnpm --filter "{apps/${appName}}..." list --depth -1 --parseable | while read -r p; do \\
      case "$p" in */packages/*) cp -r "$p" "/needed/$(basename "$p")" ;; esac; \\
    done

FROM node:22-alpine AS freshness

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
RUN corepack enable
WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/${appName} ./apps/${appName}/
COPY --from=resolver /needed ./packages/
COPY tools/packages ./tools/packages/

FROM freshness AS deps

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \\
    pnpm install --filter "{apps/${appName}}..." --frozen-lockfile
`;
}

module.exports = { generateResolverAndDepsStages };
