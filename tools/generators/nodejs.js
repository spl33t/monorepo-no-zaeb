const fs = require('fs');
const path = require('path');

/**
 * Генератор для Node.js TypeScript приложения
 * @param {string} appDir - Директория приложения
 * @param {string} name - Название приложения
 * @param {string} port - Порт приложения
 */
function createNodeJsApp(appDir, name, port = '3000') {
  // package.json
  const packageJson = {
    name,
    version: '1.0.0',
    main: './dist/index.js',
    scripts: {
      build: 'esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js',
      clean: 'rimraf dist',
      dev: 'nodemon --exec ts-node --transpile-only src/index.ts',
      start: 'node dist/index.js',
      '--------------------------------Docker commands--------------------------------': '',
      'docker:build': `node ../../tools/docker-helper.js build Dockerfile ${name}`,
      'docker:up': `node ../../tools/docker-helper.js up Dockerfile ${name} ${port} -d`,
      'docker:up:attach': `node ../../tools/docker-helper.js up Dockerfile ${name} ${port}`,
      'docker:attach': `docker attach ${name}`,
      'docker:down': `node ../../tools/docker-helper.js down ${name}`,
      'docker:logs': `docker logs -f ${name}`
    }
  };
  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // tsconfig.json
  const tsconfig = {
    extends: '../../tsconfig.json',
    compilerOptions: {
      outDir: './dist'
    },
    include: ['src/**/*']
  };
  fs.writeFileSync(
    path.join(appDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );

  // nodemon.json
  const nodemonConfig = {
    watch: ['src', '../../packages', '.env'],
    ext: 'ts,json,env',
    ignore: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    exec: 'ts-node --transpile-only src/index.ts',
    env: {
      NODE_ENV: 'development'
    }
  };
  fs.writeFileSync(
    path.join(appDir, 'nodemon.json'),
    JSON.stringify(nodemonConfig, null, 2)
  );

  // src/index.ts
  const indexContent = `#!/usr/bin/env node

import 'dotenv/config';
import http from 'http';

const PORT = process.env.PORT || ${port};

console.log('🚀 ${name} is running!');

// Создаем HTTP сервер
const server = http.createServer((req, res) => {
  // Health check endpoint для Instance Group
  // Обрабатываем /health и /health/ (с trailing slash)
  const url = req.url?.split('?')[0]; // Убираем query параметры
  if (url === '/health' || url === '/health/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Основной endpoint
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Hello from ${name}!', port: PORT }));
});

server.listen(PORT, () => {
  console.log(\`✅ Server is running on port \${PORT}\`);
});
`;
  fs.writeFileSync(path.join(appDir, 'src/index.ts'), indexContent);

  // .env.example
  const envExample = `# Environment variables
# Copy this file to .env and set your values

PORT=${port}
NODE_ENV=development
`;
  fs.writeFileSync(path.join(appDir, '.env.example'), envExample);

  // Dockerfile (Production)
  const dockerfile = `# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/${name}/package.json ./apps/${name}/
COPY packages ./packages/

# Install dependencies
RUN npm install

# Copy source code
COPY apps/${name} ./apps/${name}/

# Build application
WORKDIR /app/apps/${name}
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/${name}/package.json ./apps/${name}/
COPY packages ./packages/

# Install only production dependencies
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/apps/${name}/dist ./apps/${name}/dist

WORKDIR /app/apps/${name}

# Set port from environment variable
ENV PORT=${port}

# Expose port
EXPOSE ${port}

# Start application
CMD ["node", "dist/index.js"]
`;
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), dockerfile);

  // Dockerfile.dev (Development для watch mode)
  const dockerfileDev = `FROM node:20-alpine

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/${name}/package.json ./apps/${name}/
COPY packages ./packages/

# Install all dependencies (including dev)
RUN npm install

# Copy source code
COPY apps/${name} ./apps/${name}/

WORKDIR /app/apps/${name}

# Set port from environment variable
ENV PORT=${port}
ENV NODE_ENV=development

# Expose port
EXPOSE ${port}

# Start in dev mode (with nodemon/ts-node)
CMD ["npm", "run", "dev"]
`;
  fs.writeFileSync(path.join(appDir, 'Dockerfile.dev'), dockerfileDev);

  // .dockerignore
  const dockerignore = `node_modules
dist
.env
.env.local
*.log
.DS_Store
.git
.gitignore
README.md
.vscode
.idea
`;
  fs.writeFileSync(path.join(appDir, '.dockerignore'), dockerignore);

  return {
    structure: [
      'src/',
      '  └── index.ts',
      'package.json',
      'tsconfig.json',
      'nodemon.json',
      '.env.example',
      'Dockerfile',
      'Dockerfile.dev',
      '.dockerignore'
    ],
    commands: [
      `npm run dev --workspace=${name}       # Dev режим`,
      `npm run build --workspace=${name}     # Сборка`,
      `npm run start --workspace=${name}     # Запуск собранного`
    ],
    dockerCommands: [
      `npm run docker:build                 # Сборка образа (без запуска)`,
      `npm run docker:up                    # Сборка + запуск (фоновый режим)`,
      `npm run docker:up:attach             # Сборка + запуск с выводом логов`,
      `npm run docker:attach                # Подключение к запущенному контейнеру`,
      `npm run docker:down                  # Остановка и удаление контейнера`,
      `npm run docker:logs                  # Просмотр логов`
    ]
  };
}

module.exports = { createNodeJsApp };

