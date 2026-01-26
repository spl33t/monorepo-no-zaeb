/**
 * Генерирует Dockerfile для Vite приложений
 * @param {string} appName - Название приложения (используется в путях)
 * @returns {string} Содержимое Dockerfile
 */
function generateViteDockerfile(appName) {
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

# Start dev server
CMD ["pnpm", "run", "dev"]

# Production stage with nginx
FROM nginx:alpine AS production

# Copy built files from builder
COPY --from=builder /app/apps/${appName}/dist /usr/share/nginx/html

# Create nginx configuration template with PORT variable
# PORT will be available from env_file in docker-compose
RUN mkdir -p /etc/nginx/templates && \\
    echo 'server { \\
    listen \${PORT}; \\
    server_name _; \\
    root /usr/share/nginx/html; \\
    index index.html; \\
    location / { \\
        try_files $uri $uri/ /index.html; \\
    } \\
}' > /etc/nginx/templates/default.conf.template

# Start nginx with template processing
# envsubst replaces only \${PORT}, not $uri (which is nginx variable)
CMD ["/bin/sh", "-c", "envsubst '\${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
`;
}

module.exports = { generateViteDockerfile };
