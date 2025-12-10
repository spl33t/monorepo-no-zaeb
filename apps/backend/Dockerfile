# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/backend/package.json ./apps/backend/
COPY packages ./packages/

# Install dependencies
RUN npm install

# Copy source code
COPY apps/backend ./apps/backend/

# Build application
WORKDIR /app/apps/backend
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/backend/package.json ./apps/backend/
COPY packages ./packages/

# Install only production dependencies
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

WORKDIR /app/apps/backend

# Set port from environment variable
ENV PORT=3333

# Expose port
EXPOSE 3333

# Start application
CMD ["node", "dist/index.js"]
