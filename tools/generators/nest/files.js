const fs = require('fs');
const path = require('path');

/**
 * Nest scaffold: TypedRoute (@nestia/core), собирается webpack-билдером
 * @nestjs/cli (см. webpack-config.js) поверх ts-patch-пропатченного typescript.
 * @param {string} appDir
 * @param {string} name
 */
function generateNestFiles(appDir, name) {
  const mainContent = `import { config } from 'dotenv';
config({ path: '.env' });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const port = process.env.PORT ?? '3000';
  const host = '0.0.0.0';

  await app.listen(port, host);
  console.log(\`🚀 ${name} is running on: http://\${host}:\${port}\`);
  console.log(\`📦 NODE_ENV: \${process.env.NODE_ENV || 'not set'}\`);
}

bootstrap();
`;
  fs.writeFileSync(path.join(appDir, 'src/main.ts'), mainContent);

  fs.writeFileSync(
    path.join(appDir, 'src/app.module.ts'),
    `import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`,
  );

  fs.writeFileSync(
    path.join(appDir, 'src/app.controller.ts'),
    `import { Controller } from '@nestjs/common';
import { TypedRoute } from '@nestia/core';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @TypedRoute.Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @TypedRoute.Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
`,
  );

  fs.writeFileSync(
    path.join(appDir, 'src/app.service.ts'),
    `import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return \`🚀 ${name} API is running!\`;
  }
}
`,
  );

  fs.writeFileSync(
    path.join(appDir, 'nestia.config.ts'),
    `import type { INestiaConfig } from '@nestia/sdk';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';

/**
 * NestFactory input (samchon/backend).
 * SDK: pnpm run sdk (nestia sdk --project tsconfig.json — собственный tsconfig
 * app'а, отдельный SDK-конфиг не нужен).
 *
 * SDK едет прямо в packages/${name}-api/src — генерируемый клиент становится
 * настоящим @packages/*-пакетом (workspace:*), который любой app (в т.ч. Vite)
 * подключает как обычную зависимость, без ручного шага. package.json для
 * пакета создаётся автоматически при первом запуске, если его ещё нет —
 * дальше nestia просто перезаписывает файлы внутри src/, package.json не трогает.
 */
const PACKAGE_NAME = '${name}-api';
const PACKAGE_DIR = path.resolve(__dirname, '../../packages', PACKAGE_NAME);
const SDK_OUTPUT = path.join(PACKAGE_DIR, 'src');

const packageJsonPath = path.join(PACKAGE_DIR, 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  fs.mkdirSync(PACKAGE_DIR, { recursive: true });
  const packageJson = {
    name: '@packages/' + PACKAGE_NAME,
    version: '1.0.0',
    private: true,
    main: './src/index.ts',
    types: './src/index.ts',
    exports: { '.': './src/index.ts' },
    // @nestia/fetcher — сам SDK-клиент (PlainFetcher и т.п.), typia — типы
    // возвращаемых значений (Primitive<T>). Остальные @packages/* (DTO из
    // контроллеров) дописываются автоматически ниже, после каждой генерации.
    dependencies: {
      '@nestia/fetcher': 'catalog:nest',
      typia: 'catalog:nest',
    },
  };
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\\n');
  console.log(
    '[nestia.config] Создан packages/' + PACKAGE_NAME + '/package.json — выполни "pnpm install", ' +
    'затем добавь "@packages/' + PACKAGE_NAME + '": "workspace:*" тем, кому нужен SDK.',
  );
}

// После генерации SDK-файлы могут ссылаться (даже только через "import type")
// на другие @packages/* — например DTO контроллера, объявленный в @packages/shared.
// tsc потребителя должен резолвить такой модуль при тайпчеке, поэтому пакет
// должен быть настоящей зависимостью, а не только стёртым при сборке импортом.
// Сканируем src/ после того, как nestia допишет файлы (process 'exit' — самый
// надёжный момент: CLI отрабатывает генерацию синхронно в этом же процессе).
process.on('exit', () => {
  if (!fs.existsSync(SDK_OUTPUT)) return;

  const referenced = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const content = fs.readFileSync(entryPath, 'utf8');
      for (const match of content.matchAll(/from ['"](@packages\\/[a-z0-9-]+)['"]/g)) {
        if (match[1] !== '@packages/' + PACKAGE_NAME) referenced.add(match[1]);
      }
    }
  };
  walk(SDK_OUTPUT);
  if (referenced.size === 0) return;

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.dependencies = packageJson.dependencies || {};
  let changed = false;
  for (const pkg of referenced) {
    if (packageJson.dependencies[pkg] !== 'workspace:*') {
      packageJson.dependencies[pkg] = 'workspace:*';
      changed = true;
    }
  }
  if (!changed) return;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\\n');
  console.log(
    '[nestia.config] Добавил в packages/' + PACKAGE_NAME + '/package.json зависимост' +
    (referenced.size === 1 ? 'ь' : 'и') + ': ' + [...referenced].join(', ') + ' — выполни "pnpm install".',
  );
});

const NESTIA_CONFIG: INestiaConfig = {
  input: async () => {
    const { AppModule } = await import('./src/app.module');
    return NestFactory.create(AppModule);
  },
  output: SDK_OUTPUT,
};

export default NESTIA_CONFIG;
`,
  );

  return {
    structure: [
      '  ├── main.ts',
      '  ├── app.module.ts',
      '  ├── app.controller.ts',
      '  ├── app.service.ts',
      'nestia.config.ts',
    ],
  };
}

module.exports = { generateNestFiles };
