# Build context: nestjs-apps/
# docker build -f apps/nestjs-2/Dockerfile --target production .

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY tools/nest-cli ./tools/nest-cli/
COPY apps/nestjs-2 ./apps/nestjs-2/
COPY packages ./packages/

RUN npm ci

WORKDIR /app/apps/nestjs-2
RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app

COPY package.json package-lock.json ./
COPY tools/nest-cli ./tools/nest-cli/
COPY apps/nestjs-2/package.json ./apps/nestjs-2/

RUN npm ci --omit=dev

COPY --from=builder /app/apps/nestjs-2/dist ./apps/nestjs-2/dist

WORKDIR /app/apps/nestjs-2

CMD ["npm", "run", "start"]

FROM node:22-alpine AS development

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY tools/nest-cli ./tools/nest-cli/
COPY apps/nestjs-2 ./apps/nestjs-2/
COPY packages ./packages/

RUN npm ci

WORKDIR /app/apps/nestjs-2

CMD ["npm", "run", "dev"]
