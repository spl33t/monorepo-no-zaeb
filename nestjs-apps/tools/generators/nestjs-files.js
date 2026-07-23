const fs = require('fs');
const path = require('path');

/**
 * Классический NestJS scaffold (src/*).
 * @param {string} appDir
 * @param {string} name
 */
function generateNestJsFiles(appDir, name) {
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
    `import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
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

  return {
    structure: [
      '  ├── main.ts',
      '  ├── app.module.ts',
      '  ├── app.controller.ts',
      '  └── app.service.ts',
    ],
  };
}

/**
 * Nestia scaffold: TypedRoute + сборка через ttsc (не nest build).
 * @param {string} appDir
 * @param {string} name
 */
function generateNestiaFiles(appDir, name) {
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
  console.log(\`🚀 ${name} (nestia) is running on: http://\${host}:\${port}\`);
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
    return \`🚀 ${name} (nestia) API is running!\`;
  }
}
`,
  );

  fs.writeFileSync(
    path.join(appDir, 'nestia.config.ts'),
    `import type { INestiaConfig } from '@nestia/sdk';
import { NestFactory } from '@nestjs/core';

/**
 * NestFactory input (samchon/backend).
 * SDK: nestia sdk --project ../../tsconfig.nestia-sdk.json —
 * Nestia ставит rootDir = dirname(project) → nestjs-apps/ (root packages/ через ../packages).
 *
 * SDK_OUTPUT — куда nestia sdk пишет клиент (относительно этого файла).
 * Без пути команда падает: путь выбираешь сам под проект
 * (часто "src/api", иногда "../packages/api" и т.п.).
 */
const SDK_OUTPUT: string | undefined = undefined;

if (!SDK_OUTPUT) {
  throw new Error(
    '[nestia.config] Задай SDK_OUTPUT — каталог выгрузки SDK (например "src/api" или "../packages/api"). Сейчас путь не указан.',
  );
}

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

module.exports = { generateNestJsFiles, generateNestiaFiles };
