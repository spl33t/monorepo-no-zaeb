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
      build: 'node esbuild.config.js',
      clean: 'rimraf dist',
      dev: 'nodemon',
      start: 'node dist/index.js'
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

  // esbuild.config.js
  const esbuildConfig = `const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/index.js',
  define: {
    'process.env.NODE_ENV': '"production"'
  }
}).catch(() => process.exit(1));
`;
  fs.writeFileSync(path.join(appDir, 'esbuild.config.js'), esbuildConfig);

  // nodemon.json
  const nodemonConfig = {
    watch: ['src', '../../packages', '.env'],
    ext: 'ts,json,env',
    ignore: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    exec: 'tsx src/index.ts',
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
const HOST = '0.0.0.0';

console.log('🚀 ${name} is running!');
console.log(\`📦 NODE_ENV: \${process.env.NODE_ENV || 'not set'}\`);

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

server.listen(Number(PORT), HOST, () => {
  console.log(\`✅ Server is running on http://\${HOST}:\${PORT}\`);
});
`;
  fs.writeFileSync(path.join(appDir, 'src/index.ts'), indexContent);

  // .env.example
  const envExample = `# Environment variables
# Copy this file to .env and set your values

PORT=${port}
`;
  fs.writeFileSync(path.join(appDir, '.env.example'), envExample);
  
  // .env (создаем сразу с теми же значениями)
  const env = `PORT=${port}
`;
  fs.writeFileSync(path.join(appDir, '.env'), env);

  // Dockerfile (multi-stage: production + development)
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
FROM node:20-alpine AS production

# Port argument (default value, can be overridden via .env file in docker-compose)
ARG PORT=${port}

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

# Set port from ARG (can be overridden via .env file in docker-compose)
ENV PORT=\${PORT}

# Expose port (uses same value as ENV PORT)
EXPOSE \${PORT}

# Start application
CMD ["node", "dist/index.js"]

# Development stage
FROM node:20-alpine AS development

# Port argument (default value, can be overridden via .env file in docker-compose)
ARG PORT=${port}

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

# Set port from ARG (can be overridden via .env file in docker-compose)
ENV PORT=\${PORT}

# Expose port (uses same value as ENV PORT)
EXPOSE \${PORT}

# Start in dev mode (with nodemon/ts-node)
CMD ["npm", "run", "dev"]
`;
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), dockerfile);

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
      'esbuild.config.js',
      'nodemon.json',
      '.env',
      '.env.example',
      'Dockerfile',
      '.dockerignore'
    ],
    commands: [
      `npm run dev --workspace=${name}       # Dev режим`,
      `npm run build --workspace=${name}     # Сборка`,
      `npm run start --workspace=${name}     # Запуск собранного`
    ]
  };
}

module.exports = { createNodeJsApp };

