# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/seo-gateway/package.json ./apps/seo-gateway/
COPY packages ./packages/

# Install dependencies
RUN npm install

# Copy source code
COPY apps/seo-gateway ./apps/seo-gateway/

# Build application
WORKDIR /app/apps/seo-gateway
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/seo-gateway/package.json ./apps/seo-gateway/
COPY packages ./packages/

# Install only production dependencies
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/apps/seo-gateway/dist ./apps/seo-gateway/dist

WORKDIR /app/apps/seo-gateway

# Set default port (can be overridden via environment variable in docker-compose)
ENV PORT=4000

# Expose default port (actual port is controlled by PORT env variable at runtime)
EXPOSE 4000

# Start application
CMD ["node", "dist/index.js"]
