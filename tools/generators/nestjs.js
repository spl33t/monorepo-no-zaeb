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
      build: 'esbuild src/main.ts --bundle --platform=node --outfile=dist/index.js --packages=external',
      clean: 'rimraf dist',
      dev: 'nodemon --exec ts-node --transpile-only src/main.ts',
      start: 'node dist/index.js',
      '--------------------------------Docker commands--------------------------------': '',
      'docker:build': `node ../../tools/docker-helper.js build Dockerfile ${name}`,
      'docker:up': `node ../../tools/docker-helper.js up Dockerfile ${name} ${port} -d`,
      'docker:up:attach': `node ../../tools/docker-helper.js up Dockerfile ${name} ${port}`,
      'docker:attach': `docker attach ${name}`,
      'docker:down': `node ../../tools/docker-helper.js down ${name}`,
      'docker:logs': `docker logs -f ${name}`
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
HOST=0.0.0.0
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

# Accept port as build argument (default: ${port})
ARG PORT=${port}

# Set port from build argument or environment variable
ENV PORT=\${PORT}

# Expose port
EXPOSE \${PORT}

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

# Accept port as build argument (default: ${port})
ARG PORT=${port}

# Set port from build argument or environment variable
ENV PORT=\${PORT}
ENV NODE_ENV=development

# Expose port
EXPOSE \${PORT}

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
      '  ├── main.ts',
      '  ├── app.module.ts',
      '  ├── app.controller.ts',
      '  └── app.service.ts',
      'package.json',
      'tsconfig.json',
      'nodemon.json',
      '.env.example',
      'Dockerfile',
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
    ],
    nextSteps: [
      `Открой http://localhost:${port}`
    ]
  };
}

module.exports = { createNestJsApp };
