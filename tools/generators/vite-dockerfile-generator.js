/**
 * Генерирует Dockerfile для Vite приложений
 * @param {string} appName - Название приложения (используется в путях)
 * @returns {string} Содержимое Dockerfile
 */
function generateViteDockerfile(appName) {
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

# Start dev server
CMD ["npm", "run", "dev"]

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
