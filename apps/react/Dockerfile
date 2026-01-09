# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/react/package.json ./apps/react/
COPY packages ./packages/

# Install dependencies
RUN npm install

# Copy source code
COPY apps/react ./apps/react/

# Build application
WORKDIR /app/apps/react
RUN npm run build

# Development stage
FROM node:20-alpine AS development

ARG PORT=80

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/react/package.json ./apps/react/
COPY packages ./packages/

# Install all dependencies (including dev)
RUN npm install

# Copy source code
COPY apps/react ./apps/react/

WORKDIR /app/apps/react

# Set port from ARG (can be overridden via .env file in docker-compose)
ENV PORT=${PORT}

# Expose port
EXPOSE ${PORT}

# Start dev server
CMD ["npm", "run", "dev"]

# Production stage with nginx
FROM nginx:alpine AS production

ARG PORT=80

# Copy built files from builder
COPY --from=builder /app/apps/react/dist /usr/share/nginx/html

# Create nginx configuration template with PORT variable
# PORT will be available from env_file in docker-compose
RUN mkdir -p /etc/nginx/templates && \
    echo 'server { \
    listen ${PORT}; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/templates/default.conf.template

# Set port from ARG (can be overridden via .env file in docker-compose)
ENV PORT=${PORT}

# Expose port (uses same value as ENV PORT)
EXPOSE ${PORT}

# Start nginx with template processing
# envsubst replaces only ${PORT}, not $uri (which is nginx variable)
CMD ["/bin/sh", "-c", "envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
