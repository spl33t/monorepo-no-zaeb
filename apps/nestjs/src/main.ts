import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const port = process.env.PORT!; // Валидация выполняется в tsdown.config.ts
  const host = '0.0.0.0';

  await app.listen(port, host);
  console.log(`🚀 nestjs is running on: http://${host}:${port}`);
  console.log(`📦 NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
}

bootstrap();

