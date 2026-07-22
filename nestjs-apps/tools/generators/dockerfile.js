/**
 * Dockerfile for NestJS app — build context = nestjs-apps/
 * @param {string} appName
 * @returns {string}
 */
function generateNodeDockerfile(appName) {
  return `# Build context: nestjs-apps/
# docker build -f apps/${appName}/Dockerfile --target production .

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY tools/nest-cli ./tools/nest-cli/
COPY apps/${appName} ./apps/${appName}/
COPY packages ./packages/

RUN npm ci

WORKDIR /app/apps/${appName}
RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app

COPY package.json package-lock.json ./
COPY tools/nest-cli ./tools/nest-cli/
COPY apps/${appName}/package.json ./apps/${appName}/

RUN npm ci --omit=dev

COPY --from=builder /app/apps/${appName}/dist ./apps/${appName}/dist

WORKDIR /app/apps/${appName}

CMD ["npm", "run", "start"]

FROM node:22-alpine AS development

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY tools/nest-cli ./tools/nest-cli/
COPY apps/${appName} ./apps/${appName}/
COPY packages ./packages/

RUN npm ci

WORKDIR /app/apps/${appName}

CMD ["npm", "run", "dev"]
`;
}

module.exports = { generateNodeDockerfile };
