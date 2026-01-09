# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/test/package.json ./apps/test/
COPY packages ./packages/

# Install dependencies
RUN npm install

# Copy source code
COPY apps/test ./apps/test/

# Build application
WORKDIR /app/apps/test
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Port argument (can be overridden at build time)
ARG PORT=3000

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/test/package.json ./apps/test/
COPY packages ./packages/

# Install only production dependencies
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/apps/test/dist ./apps/test/dist

WORKDIR /app/apps/test

# Set port from ARG (can be overridden via environment variable in docker-compose)
ENV PORT=${PORT}

# Expose port (uses same value as ENV PORT)
EXPOSE ${PORT}

# Start application
CMD ["node", "dist/index.js"]

# Development stage
FROM node:20-alpine AS development

# Port argument (can be overridden at build time)
ARG PORT=3000

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/test/package.json ./apps/test/
COPY packages ./packages/

# Install all dependencies (including dev)
RUN npm install

# Copy source code
COPY apps/test ./apps/test/

WORKDIR /app/apps/test

# Set port from ARG (can be overridden via environment variable)
ENV PORT=${PORT}
ENV NODE_ENV=development

# Expose port (uses same value as ENV PORT)
EXPOSE ${PORT}

# Start in dev mode (with nodemon/ts-node)
CMD ["npm", "run", "dev"]
