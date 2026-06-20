/**
 * Генерирует Dockerfile для Node.js приложений
 * @param {string} appName - Название приложения (используется в путях)
 * @returns {string}
 */
function generateNodeDockerfile(appName) {
  return `# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack for pnpm (will use version from packageManager field)
RUN corepack enable

# Copy root package files
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.json ./

# Copy tools directory (needed for preinstall script)
COPY tools ./tools/

# Copy workspace configuration
COPY apps/${appName} ./apps/${appName}/
COPY packages ./packages/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build application
WORKDIR /app/apps/${appName}
RUN pnpm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Enable corepack for pnpm (will use version from packageManager field)
RUN corepack enable

# Copy root package files
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.json ./

# Copy tools directory (needed for preinstall script + @monorepo/node-run)
COPY tools ./tools/

# Copy workspace configuration
COPY apps/${appName}/package.json ./apps/${appName}/
COPY packages ./packages/

# Production deps + node-run (root devDependency, нужен для pnpm run start)
RUN pnpm install --prod --frozen-lockfile \\
  && pnpm install --frozen-lockfile -w @monorepo/node-run

# Copy built application from builder (dist/apps/*, dist/packages/*, symlinks)
COPY --from=builder /app/apps/${appName}/dist ./apps/${appName}/dist

WORKDIR /app/apps/${appName}

CMD ["pnpm", "run", "start"]

# Development stage
FROM node:22-alpine AS development

WORKDIR /app

# Enable corepack for pnpm (will use version from packageManager field)
RUN corepack enable

# Copy root package files
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.json ./

# Copy tools directory (needed for preinstall script)
COPY tools ./tools/

# Copy workspace configuration
COPY apps/${appName} ./apps/${appName}/
COPY packages ./packages/

# Install all dependencies (including dev)
RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/${appName}

CMD ["pnpm", "run", "dev"]
`;
}

module.exports = { generateNodeDockerfile };
