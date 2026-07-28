const { generateResolverAndDepsStages } = require('../shared/dockerfile-common');

/**
 * Dockerfile for Vite app — build context = monorepo root, pnpm workspace.
 * `resolver`/`freshness`/`deps` — общие с nest-генератором стадии, см.
 * tools/generators/shared/dockerfile-common.js (там же обоснование резолвера
 * и freshness-проверки).
 *
 * COPY только apps/<name> (не весь apps/) — appName известен генератору на
 * момент записи файла, обычный не-glob COPY одной папки, см. подробное
 * обоснование в комментарии nest-генератора (tools/generators/nest/dockerfile.js).
 *
 * packages/* — настоящие workspace-пакеты (workspace:*, свой package.json,
 * БЕЗ build script — сырой TS, Vite резолвит и транспайлит его на лету сам,
 * никакой отдельной настройки не требуется). Production (nginx, статика)
 * packages/* вообще не копирует — Vite их уже забандлил в dist.
 * @param {string} appName
 * @returns {string}
 */
function generateViteDockerfile(appName) {
  return `# Build context: monorepo root
# docker build -f apps/${appName}/Dockerfile --target production .

${generateResolverAndDepsStages(appName)}
# builder и development ставят deps одинаково — общая стадия; production (nginx) их не ставит вовсе.
FROM deps AS builder

WORKDIR /src/apps/${appName}
RUN pnpm run build

FROM deps AS development

WORKDIR /src/apps/${appName}

CMD ["pnpm", "run", "dev"]

FROM nginx:alpine AS production

# PORT из env_file compose; filter — чтобы envsubst не трогал $uri в try_files
ENV PORT=80
ENV NGINX_ENVSUBST_FILTER=PORT
COPY tools/docker/nginx-default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /src/apps/${appName}/dist /usr/share/nginx/html
`;
}

module.exports = { generateViteDockerfile };
