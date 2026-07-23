/**
 * Dockerfile for Vite app — build context = monorepo root.
 * Deps: тот же `install-deps.js` без флагов (видит только скопированные package.json).
 * @param {string} appName
 * @returns {string}
 */
function generateViteDockerfile(appName) {
  return `# Build context: monorepo root
# docker build -f vite-apps/apps/${appName}/Dockerfile --target production .
# Install: COPY package.json нужных корней → node tools/cli/install-deps.js

FROM node:22-alpine AS deps

WORKDIR /src

COPY package.json package-lock.json ./
COPY tools/cli/install-deps.js ./tools/cli/
COPY vite-apps/package.json vite-apps/package-lock.json ./vite-apps/
COPY vite-apps/apps/${appName}/package.json ./vite-apps/apps/${appName}/

RUN node tools/cli/install-deps.js

# builder и development ставят deps одинаково — общая стадия; production (nginx) их не ставит вовсе.
FROM deps AS builder

COPY packages ./packages/
COPY vite-apps/tsconfig.json ./vite-apps/
COPY vite-apps/vite.config.base.ts ./vite-apps/
COPY vite-apps/apps/${appName} ./vite-apps/apps/${appName}/
COPY vite-apps/packages ./vite-apps/packages/

WORKDIR /src/vite-apps/apps/${appName}
RUN npm run build

FROM deps AS development

COPY packages ./packages/
COPY vite-apps/tsconfig.json ./vite-apps/
COPY vite-apps/vite.config.base.ts ./vite-apps/
COPY vite-apps/apps/${appName} ./vite-apps/apps/${appName}/
COPY vite-apps/packages ./vite-apps/packages/

WORKDIR /src/vite-apps/apps/${appName}

CMD ["npm", "run", "dev"]

FROM nginx:alpine AS production

# PORT из env_file compose; filter — чтобы envsubst не трогал $uri в try_files
ENV PORT=80
ENV NGINX_ENVSUBST_FILTER=PORT
COPY vite-apps/docker/nginx-default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /src/vite-apps/apps/${appName}/dist /usr/share/nginx/html
`;
}

module.exports = { generateViteDockerfile };
