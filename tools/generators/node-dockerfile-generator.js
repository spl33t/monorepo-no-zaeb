/**
 * Генерирует Dockerfile для Node.js приложений
 * @param {string} appName - Название приложения (используется в путях)
 * @returns {string} Содержимое Dockerfile
 */
function generateNodeDockerfile(appName) {
  return `# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/${appName}/package.json ./apps/${appName}/
COPY packages ./packages/

# Install dependencies
RUN npm install

# Copy source code
COPY apps/${appName} ./apps/${appName}/

# Build application
WORKDIR /app/apps/${appName}
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/${appName}/package.json ./apps/${appName}/
COPY packages ./packages/

# Install only production dependencies
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/apps/${appName}/dist ./apps/${appName}/dist

WORKDIR /app/apps/${appName}

# Start application
CMD ["npm", "run", "start"]

# Development stage
FROM node:20-alpine AS development

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/${appName}/package.json ./apps/${appName}/
COPY packages ./packages/

# Install all dependencies (including dev)
RUN npm install

# Copy source code
COPY apps/${appName} ./apps/${appName}/

WORKDIR /app/apps/${appName}

# Start in dev mode (with nodemon/ts-node)
CMD ["npm", "run", "dev"]
`;
}

module.exports = { generateNodeDockerfile };
