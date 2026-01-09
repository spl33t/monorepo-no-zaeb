const fs = require('fs');
const path = require('path');

/**
 * Генератор для NestJS API сервера
 * @param {string} appDir - Директория приложения
 * @param {string} name - Название приложения
 * @param {string} port - Порт приложения
 */
function createNestJsApp(appDir, name, port = '3000') {
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
    },
    dependencies: {
      '@nestjs/common': '^10.0.0',
      '@nestjs/core': '^10.0.0',
      '@nestjs/platform-express': '^10.0.0',
      'reflect-metadata': '^0.1.13',
      'rxjs': '^7.8.0'
    },
    devDependencies: {
      '@nestjs/cli': '^10.0.0',
      '@nestjs/schematics': '^10.0.0'
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
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/index.js',
  packages: 'external',
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
    exec: 'ts-node --transpile-only src/main.ts',
    env: {
      NODE_ENV: 'development'
    }
  };
  fs.writeFileSync(
    path.join(appDir, 'nodemon.json'),
    JSON.stringify(nodemonConfig, null, 2)
  );

  // src/main.ts
  const mainContent = `import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const port = process.env.PORT || ${port};
  // 0.0.0.0 означает "слушать на всех сетевых интерфейсах"
  // Это позволяет серверу быть доступным:
  // - Локально: http://localhost:\${port} или http://127.0.0.1:\${port}
  // - Из сети: http://<IP-адрес>:\${port}
  // - В контейнерах: для health checks от Instance Group
  // ⚠️ В браузере нельзя перейти по 0.0.0.0 - используйте localhost!
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(\`🚀 ${name} is running on: http://\${host}:\${port}\`);
}

bootstrap();
`;
  fs.writeFileSync(path.join(appDir, 'src/main.ts'), mainContent);

  // src/app.module.ts
  const moduleContent = `import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`;
  fs.writeFileSync(path.join(appDir, 'src/app.module.ts'), moduleContent);

  // src/app.controller.ts
  const controllerContent = `import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Health check endpoint для Instance Group
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }
}
`;
  fs.writeFileSync(path.join(appDir, 'src/app.controller.ts'), controllerContent);

  // src/app.service.ts
  const serviceContent = `import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return '🚀 ${name} API is running!';
  }
}
`;
  fs.writeFileSync(path.join(appDir, 'src/app.service.ts'), serviceContent);

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
      '  ├── main.ts',
      '  ├── app.module.ts',
      '  ├── app.controller.ts',
      '  └── app.service.ts',
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
    ],
    nextSteps: [
      `Открой http://localhost:${port}`
    ]
  };
}

module.exports = { createNestJsApp };
