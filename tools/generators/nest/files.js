const fs = require('fs');
const path = require('path');

/**
 * Nest scaffold: TypedRoute (@nestia/core), собирается webpack-билдером
 * @nestjs/cli (см. webpack-config.js) поверх ts-patch-пропатченного typescript.
 * @param {string} appDir
 * @param {string} name
 */
function generateNestFiles(appDir, name) {
  const mainContent = `import { NestFactory } from '@nestjs/core';
import { env } from '@env';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const port = env.PORT;
  const host = '0.0.0.0';

  await app.listen(port, host);
  console.log(\`🚀 ${name} is running on: http://\${host}:\${port}\`);
  console.log(\`📦 NODE_ENV: \${env.NODE_ENV}\`);
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

  fs.mkdirSync(path.join(appDir, 'src/types'), { recursive: true });
  fs.writeFileSync(
    path.join(appDir, 'src/types/global.ts'),
    `// Сюда — global-декларации (namespace-аугментации и т.п.). nestia.config.ts
// грузится отдельным ts-node-контекстом (не через webpack), поэтому
// подхватывает этот файл только по явному triple-slash reference (см.
// nestia.config.ts) — иначе SDK-генератор не увидит те же global-типы, что
// видит основной билд приложения (проверено живьём: без reference nestia
// sdk падает с крашем внутри @nestia/core на контроллере, использующем
// отсюда тип).

// Аугментация Express.Request — merge в РЕАЛЬНЫЙ namespace Express из
// @types/express (devDependency), а не создание нового изолированного —
// поэтому она видна и в @Req() req: Request (из 'express'), и в
// req.someField напрямую. Добавляй свои поля сюда (например то, что
// проставляет auth-middleware/guard).
declare global {
  namespace Express {
    interface Request {}
  }
}

export {};
`,
  );

  fs.writeFileSync(
    path.join(appDir, 'nestia.config.ts'),
    `/// <reference path="./src/types/global.ts" />

import type { INestiaConfig } from '@nestia/sdk';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';

/**
 * NestFactory input (samchon/backend).
 * SDK: pnpm run nestia:sdk (nestia sdk --project tsconfig.json — собственный
 * tsconfig app'а, отдельный SDK-конфиг не нужен).
 *
 * SDK едет прямо в packages/<name>-api-client/src — генерируемый клиент
 * становится настоящим @packages/*-пакетом (workspace:*), который любой app
 * (в т.ч. Vite) подключает как обычную зависимость, без ручного шага.
 * package.json для пакета создаётся автоматически при первом запуске, если
 * его ещё нет — дальше nestia просто перезаписывает файлы внутри src/,
 * package.json не трогает.
 *
 * APP_NAME читается из package.json в рантайме (а не подставляется на этапе
 * scaffold'а, как '${name}' в остальных generated-файлах) — переименование
 * app'а/пакета в package.json подхватывается без регенерации nestia.config.ts.
 *
 * clone: true — DTO физически копируются в src/structures вместо того, чтобы
 * генерируемый код ссылался на них через "import type" из исходного
 * @packages/*. Это снимает саму возможность появления @packages/*-импортов в
 * SDK — раньше здесь был process.on('exit', ...) сканер таких импортов,
 * дописывающий их в package.json как workspace:*-зависимости; с clone он
 * структурно никогда не сработал бы, поэтому убран.
 */
const APP_NAME = (require('./package.json').name as string).replace(/^@[^/]+\\//, '');
const PACKAGE_NAME = APP_NAME + '-api-client';
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
    // возвращаемых значений (Primitive<T>). DTO клонируются локально
    // (clone: true), поэтому больше ничего не требуется.
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

const NESTIA_CONFIG: INestiaConfig = {
  input: async () => {
    const { AppModule } = await import('./src/app.module');
    return NestFactory.create(AppModule);
  },
  output: SDK_OUTPUT,
  clone: true,
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
      '  └── types/',
      '      └── global.ts',
      'nestia.config.ts',
    ],
  };
}

module.exports = { generateNestFiles };
