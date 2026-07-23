/**
 * Dockerfile for Nest app — build context = monorepo root.
 * Deps: тот же `install-deps.js` без флагов (видит только скопированные package.json).
 * @param {string} appName
 * @returns {string}
 */
function generateNodeDockerfile(appName) {
  return `# Build context: monorepo root
# docker build -f nestjs-apps/apps/${appName}/Dockerfile --target production .
# Install: COPY package.json нужных корней → node tools/cli/install-deps.js

FROM node:22-alpine AS deps

WORKDIR /src

COPY package.json package-lock.json ./
COPY tools/cli/install-deps.js ./tools/cli/
COPY nestjs-apps/package.json nestjs-apps/package-lock.json ./nestjs-apps/
COPY nestjs-apps/apps/${appName}/package.json ./nestjs-apps/apps/${appName}/

RUN node tools/cli/install-deps.js

# builder/development ставят deps одинаково (без --omit=dev) → общая стадия deps.
# production ставит отдельно: ENV NODE_ENV=production меняет install-deps.js на --omit=dev.
FROM deps AS builder

COPY packages ./packages/
COPY nestjs-apps/tsconfig.json ./nestjs-apps/
COPY nestjs-apps/apps/${appName} ./nestjs-apps/apps/${appName}/
COPY nestjs-apps/packages ./nestjs-apps/packages/

WORKDIR /src/nestjs-apps/apps/${appName}
RUN npm run build

FROM node:22-alpine AS production

WORKDIR /src
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY tools/cli/install-deps.js ./tools/cli/
COPY nestjs-apps/package.json nestjs-apps/package-lock.json ./nestjs-apps/
COPY nestjs-apps/apps/${appName}/package.json ./nestjs-apps/apps/${appName}/

RUN node tools/cli/install-deps.js

COPY packages ./packages/
COPY --from=builder /src/nestjs-apps/apps/${appName}/dist ./nestjs-apps/apps/${appName}/dist

WORKDIR /src/nestjs-apps/apps/${appName}

CMD ["npm", "run", "start"]

FROM deps AS development

COPY packages ./packages/
COPY nestjs-apps/tsconfig.json ./nestjs-apps/
COPY nestjs-apps/apps/${appName} ./nestjs-apps/apps/${appName}/
COPY nestjs-apps/packages ./nestjs-apps/packages/

WORKDIR /src/nestjs-apps/apps/${appName}

CMD ["npm", "run", "dev"]
`;
}

module.exports = { generateNodeDockerfile };
