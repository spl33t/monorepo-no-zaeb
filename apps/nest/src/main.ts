import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const port = process.env.PORT || 4343;
  const host = '0.0.0.0';
  await app.listen(port, host);
  console.log(`🚀 nest is running on: http://${host}:${port}`);
  console.log(`📦 NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
}

bootstrap();
