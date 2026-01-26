/**
 * Генерирует Dockerfile для Node.js приложений
 * @param {string} appName - Название приложения (используется в путях)
 * @returns {string} Содержимое Dockerfile
 */
function generateNodeDockerfile(appName) {
  return `# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Enable corepack for pnpm (will use version from packageManager field)
RUN corepack enable

# Copy root package files
COPY package*.json ./
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
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
FROM node:20-alpine AS production

WORKDIR /app

# Enable corepack for pnpm (will use version from packageManager field)
RUN corepack enable

# Copy root package files
COPY package*.json ./
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy tools directory (needed for preinstall script)
COPY tools ./tools/

# Copy workspace configuration
COPY apps/${appName}/package.json ./apps/${appName}/
COPY packages ./packages/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder
COPY --from=builder /app/apps/${appName}/dist ./apps/${appName}/dist

WORKDIR /app/apps/${appName}

# Start application
CMD ["pnpm", "run", "start"]

# Development stage
FROM node:20-alpine AS development

WORKDIR /app

# Enable corepack for pnpm (will use version from packageManager field)
RUN corepack enable

# Copy root package files
COPY package*.json ./
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy tools directory (needed for preinstall script)
COPY tools ./tools/

# Copy workspace configuration
COPY apps/${appName} ./apps/${appName}/
COPY packages ./packages/

# Install all dependencies (including dev)
# В development режиме не используем --frozen-lockfile для гибкости
RUN pnpm install

WORKDIR /app/apps/${appName}

# Start in dev mode (with nodemon/ts-node)
CMD ["pnpm", "run", "dev"]
`;
}

module.exports = { generateNodeDockerfile };
