# Build context: vite-apps/
# docker build -f apps/react-2/Dockerfile --target production .

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY vite.config.base.ts ./
COPY tools/vite-cli ./tools/vite-cli/
COPY apps/react-2 ./apps/react-2/
COPY packages ./packages/

RUN npm ci

WORKDIR /app/apps/react-2
RUN npm run build

FROM node:22-alpine AS development

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY vite.config.base.ts ./
COPY tools/vite-cli ./tools/vite-cli/
COPY apps/react-2 ./apps/react-2/
COPY packages ./packages/

RUN npm ci

WORKDIR /app/apps/react-2

CMD ["npm", "run", "dev"]

FROM nginx:alpine AS production

COPY --from=builder /app/apps/react-2/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
