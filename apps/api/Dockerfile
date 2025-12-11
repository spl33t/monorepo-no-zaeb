# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/api/package.json ./apps/api/
COPY packages ./packages/

# Install dependencies
RUN npm install

# Copy source code
COPY apps/api ./apps/api/

# Build application
WORKDIR /app/apps/api
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/api/package.json ./apps/api/
COPY packages ./packages/

# Install only production dependencies
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api

# Set port from environment variable
ENV PORT=4444

# Expose port
EXPOSE 4444

# Start application
CMD ["node", "dist/index.js"]
