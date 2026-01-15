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
    main: './dist/index.cjs',
    scripts: {
      build: 'tsdown',
      dev: 'tsdown --dev',
      start: 'node --enable-source-maps dist/index.cjs'
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

  // tsdown.config.ts
  const tsdownConfig = `import { defineConfig } from 'tsdown';
import path from 'path';

// Проверяем аргументы командной строки
const args = process.argv.slice(2);
const isDev = args.includes('--dev') || args.includes('dev') || process.env.NODE_ENV === 'development';

let nodemonInstance: any = null;
let typeCheckScheduled = false;

// Функция для проверки доступности приложения через HTTP ping
async function waitForAppReady(port: number, maxAttempts = 30, delay = 500): Promise<boolean> {
  const http = await import('http');
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            hostname: 'localhost',
            port,
            path: '/health',
            method: 'GET',
            timeout: 1000,
          },
          (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              reject(new Error(\`Status: \${res.statusCode}\`));
            }
          }
        );
        
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
        
        req.end();
      });
      
      return true; // Приложение готово
    } catch (error) {
      // Приложение ещё не готово, ждём
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return false; // Приложение не запустилось за отведённое время
}

// Функция проверки типов TypeScript
async function checkTypeScript() {
  if (typeCheckScheduled) return;
  typeCheckScheduled = true;
  
  const { execSync } = await import('child_process');
  try {
    execSync('tsc --noEmit', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    // Если ошибок нет - ничего не выводим
  } catch (error) {
    // Ошибки уже выведены через stdio: 'inherit'
    if (!isDev) {
      // В production прерываем процесс при ошибках типов
      process.exit(1);
    }
    // В dev режиме продолжаем работу, ошибки уже выведены
  } finally {
    typeCheckScheduled = false;
  }
}

export default defineConfig({
  entry: {
    index: 'src/main.ts',
  },
  platform: 'node',
  format: ['cjs'],
  outDir: 'dist',
  dts: false,
  clean: !isDev, // Не очищаем dist в dev режиме для инкрементальной сборки
  shims: false,
  treeshake: true,
  sourcemap: true, // Включаем sourcemap в dev и production режимах
  watch: isDev, // Включаем watch режим при наличии аргумента dev
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
  },
  hooks: {
    'build:done': async () => {
      if (isDev && !nodemonInstance) {
        // Запускаем nodemon программно после первой сборки
        const nodemon = (await import('nodemon')).default;
        
        // Получаем порт из переменных окружения или используем дефолтный
        const port = parseInt(process.env.PORT || '${port}', 10);

        nodemonInstance = nodemon({
          script: path.join(process.cwd(), 'dist', 'index.cjs'),
          watch: ['dist'],
          ext: 'cjs',
          ignore: ['dist/**/*.spec.js', 'dist/**/*.test.js'],
          delay: 500, // Задержка перед перезапуском
          env: {
            NODE_OPTIONS: '--enable-source-maps',
          },
        });

        nodemonInstance
          .on('start', async () => {
            console.log('🚀 Nodemon запущен');
            
            // Ждём, пока приложение запустится и ответит на HTTP ping
            const isReady = await waitForAppReady(port);
            if (isReady) {
              // Проверяем типы после того, как приложение запустилось
              // Ошибки выводятся автоматически через stdio: 'inherit'
              await checkTypeScript();
            }
          })
          .on('restart', async (files: string[]) => {
            console.log('🔄 Перезапуск nodemon из-за изменений:', files);
          })
          .on('crash', () => {
            console.log('❌ Приложение упало, nodemon перезапустит его');
          });

        // Обработка завершения процесса
        process.on('SIGINT', () => {
          if (nodemonInstance) {
            nodemonInstance.emit('quit');
          }
          process.exit(0);
        });

        process.on('SIGTERM', () => {
          if (nodemonInstance) {
            nodemonInstance.emit('quit');
          }
          process.exit(0);
        });
      }
    },
  },
});
`;
  fs.writeFileSync(path.join(appDir, 'tsdown.config.ts'), tsdownConfig);

  // src/main.ts
  const mainContent = `import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const port = process.env.PORT || ${port};
  const host = '0.0.0.0';
  await app.listen(port, host);
  console.log(\`🚀 ${name} is running on: http://\${host}:\${port}\`);
  console.log(\`📦 NODE_ENV: \${process.env.NODE_ENV || 'not set'}\`);
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
CMD ["node", "dist/index.cjs"]

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
      'tsdown.config.ts',
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
