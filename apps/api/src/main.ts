// Загружаем dotenv с опцией override: false, чтобы переменные окружения из docker-compose
// имели приоритет над .env файлом
try {
  const dotenv = require('dotenv');
  dotenv.config({ override: false });
} catch (e) {
  // dotenv может быть недоступен в некоторых окружениях - это нормально
  // переменные окружения из docker-compose все равно будут работать
}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Переменная окружения PORT из docker-compose имеет приоритет над .env файлом
  // Если не установлена, используем значение из .env или дефолт 4444
  const port = Number(process.env.PORT) || 4444;
  
  // Логируем для отладки (в production можно убрать)
  console.log(`🔍 Environment check:`);
  console.log(`   PORT from env: ${process.env.PORT || 'not set'}`);
  console.log(`   Using port: ${port}`);
  
  // 0.0.0.0 означает "слушать на всех сетевых интерфейсах"
  // Это позволяет серверу быть доступным:
  // - Локально: http://localhost:${port} или http://127.0.0.1:${port}
  // - Из сети: http://<IP-адрес>:${port}
  // - В контейнерах: для health checks от Instance Group
  // ⚠️ В браузере нельзя перейти по 0.0.0.0 - используйте localhost!
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`🚀 api is running on: http://${host}:${port}`);
}

bootstrap();
