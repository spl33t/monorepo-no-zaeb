import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const port = process.env.PORT || 4444;
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
