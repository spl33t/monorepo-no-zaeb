const fs = require('fs');
const path = require('path');

/**
 * Генерирует специфичные файлы для NestJS приложения
 * @param {string} appDir - Директория приложения
 * @param {string} name - Название приложения
 */
function generateNestJsFiles(appDir, name) {
  // package.json dependencies
  const dependencies = {
    '@nestjs/common': '^10.0.0',
    '@nestjs/core': '^10.0.0',
    '@nestjs/platform-express': '^10.0.0',
    'reflect-metadata': '^0.1.13',
    'rxjs': '^7.8.0'
  };

  const devDependencies = {
    '@nestjs/cli': '^10.0.0',
    '@nestjs/schematics': '^10.0.0'
  };

  // src/main.ts
  const mainContent = `import { config } from 'dotenv';
config({ path: '.env', override: true });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const port = process.env.PORT!; // Валидация выполняется в tsdown.config.ts
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

  return {
    dependencies,
    devDependencies,
    entryPath: 'src/main.ts',
    structure: [
      '  ├── main.ts',
      '  ├── app.module.ts',
      '  ├── app.controller.ts',
      '  └── app.service.ts'
    ]
  };
}

module.exports = { generateNestJsFiles };
