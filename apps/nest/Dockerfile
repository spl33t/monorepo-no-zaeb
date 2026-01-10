# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/nest/package.json ./apps/nest/
COPY packages ./packages/

# Install dependencies
RUN npm install

# Copy source code
COPY apps/nest ./apps/nest/

# Build application
WORKDIR /app/apps/nest
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Port argument (default value, can be overridden via .env file in docker-compose)
ARG PORT=4343

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/nest/package.json ./apps/nest/
COPY packages ./packages/

# Install only production dependencies
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/apps/nest/dist ./apps/nest/dist

WORKDIR /app/apps/nest

# Set port from ARG (can be overridden via .env file in docker-compose)
ENV PORT=${PORT}

# Expose port (uses same value as ENV PORT)
EXPOSE ${PORT}

# Start application
CMD ["node", "dist/index.js"]

# Development stage
FROM node:20-alpine AS development

# Port argument (default value, can be overridden via .env file in docker-compose)
ARG PORT=4343

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/nest/package.json ./apps/nest/
COPY packages ./packages/

# Install all dependencies (including dev)
RUN npm install

# Copy source code
COPY apps/nest ./apps/nest/

WORKDIR /app/apps/nest

# Set port from ARG (can be overridden via .env file in docker-compose)
ENV PORT=${PORT}

# Expose port (uses same value as ENV PORT)
EXPOSE ${PORT}

# Start in dev mode (with nodemon/ts-node)
CMD ["npm", "run", "dev"]
