# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/nestjs/package.json ./apps/nestjs/
COPY packages ./packages/

# Install dependencies
RUN npm install

# Copy source code
COPY apps/nestjs ./apps/nestjs/

# Build application
WORKDIR /app/apps/nestjs
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/nestjs/package.json ./apps/nestjs/
COPY packages ./packages/

# Install only production dependencies
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/apps/nestjs/dist ./apps/nestjs/dist

WORKDIR /app/apps/nestjs

# Start application
CMD ["npm", "run", "start"]

# Development stage
FROM node:20-alpine AS development

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/nestjs/package.json ./apps/nestjs/
COPY packages ./packages/

# Install all dependencies (including dev)
RUN npm install

# Copy source code
COPY apps/nestjs ./apps/nestjs/

WORKDIR /app/apps/nestjs

# Start in dev mode (with nodemon/ts-node)
CMD ["npm", "run", "dev"]
