const { generateResolverAndDepsStages } = require('../shared/dockerfile-common');

/**
 * Dockerfile for Nest app — build context = monorepo root, pnpm workspace.
 * `resolver`/`freshness`/`deps` — общие с vite-генератором стадии, см.
 * tools/generators/shared/dockerfile-common.js (там же обоснование резолвера
 * и freshness-проверки).
 *
 * COPY только apps/<name> (не весь apps/) — appName известен генератору на
 * момент записи файла, обычный не-glob COPY одной конкретной папки. Раньше
 * копировался весь apps/ целиком — образ каждого app'а содержал исходники
 * ВСЕХ остальных apps (проверено живьём: `docker exec nest-nest ls /src/apps/`
 * показывал чужой `react/`) и пересобирался при правке любого чужого app'а.
 *
 * production — FROM deps, не отдельная параллельная COPY+install. `pnpm
 * prune --prod` убирает devDependencies из уже поставленного node_modules
 * вместо повторной установки с нуля — экономит сетевой трафик и время (deps
 * и так уже всё поставил), lifecycle-скрипты (prepare/ts-patch) при этом не
 * перезапускаются, поэтому `--ignore-scripts` (нужен был раньше именно
 * из-за повторного `pnpm install --prod`) тоже не нужен. Итоговый размер
 * образа — проверено живьём — практически идентичен старому подходу с
 * отдельной COPY+install (разница в пределах шума, ~13KB на ~348MB).
 * @param {string} appName
 * @returns {string}
 */
function generateNodeDockerfile(appName) {
  return `# Build context: monorepo root
# docker build -f apps/${appName}/Dockerfile --target production .

${generateResolverAndDepsStages(appName)}
FROM deps AS builder

WORKDIR /src/apps/${appName}
RUN pnpm run build

FROM deps AS production

WORKDIR /src
ENV NODE_ENV=production

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \\
    pnpm prune --prod

COPY --from=builder /src/apps/${appName}/dist ./apps/${appName}/dist

WORKDIR /src/apps/${appName}

CMD ["pnpm", "run", "start"]

FROM deps AS development

WORKDIR /src/apps/${appName}

CMD ["pnpm", "run", "dev"]
`;
}

module.exports = { generateNodeDockerfile };
