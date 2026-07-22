/**
 * Dockerfile for Vite app — build context = vite-apps/
 * @param {string} appName
 * @returns {string}
 */
function generateViteDockerfile(appName) {
  return `# Build context: vite-apps/
# docker build -f apps/${appName}/Dockerfile --target production .

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY vite.config.base.ts ./
COPY tools/vite-cli ./tools/vite-cli/
COPY apps/${appName} ./apps/${appName}/
COPY packages ./packages/

RUN npm ci

WORKDIR /app/apps/${appName}
RUN npm run build

FROM node:22-alpine AS development

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY vite.config.base.ts ./
COPY tools/vite-cli ./tools/vite-cli/
COPY apps/${appName} ./apps/${appName}/
COPY packages ./packages/

RUN npm ci

WORKDIR /app/apps/${appName}

CMD ["npm", "run", "dev"]

FROM nginx:alpine AS production

COPY --from=builder /app/apps/${appName}/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
}

module.exports = { generateViteDockerfile };
