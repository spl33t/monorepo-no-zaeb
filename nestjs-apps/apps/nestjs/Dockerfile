# Build context: nestjs-apps/
# docker build -f apps/nestjs/Dockerfile --target production .

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY tools/nest-cli ./tools/nest-cli/
COPY apps/nestjs ./apps/nestjs/
COPY packages ./packages/

RUN npm ci

WORKDIR /app/apps/nestjs
RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app

COPY package.json package-lock.json ./
COPY tools/nest-cli ./tools/nest-cli/
COPY apps/nestjs/package.json ./apps/nestjs/

RUN npm ci --omit=dev

COPY --from=builder /app/apps/nestjs/dist ./apps/nestjs/dist

WORKDIR /app/apps/nestjs

CMD ["npm", "run", "start"]

FROM node:22-alpine AS development

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY tools/nest-cli ./tools/nest-cli/
COPY apps/nestjs ./apps/nestjs/
COPY packages ./packages/

RUN npm ci

WORKDIR /app/apps/nestjs

CMD ["npm", "run", "dev"]
