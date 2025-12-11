#!/usr/bin/env node

// Загружаем dotenv с опцией override: false, чтобы переменные окружения из docker-compose
// имели приоритет над .env файлом
try {
  const dotenv = require('dotenv');
  dotenv.config({ override: false });
} catch (e) {
  // dotenv может быть недоступен в некоторых окружениях - это нормально
  // переменные окружения из docker-compose все равно будут работать
}

import http from 'http';

// Переменная окружения PORT из docker-compose имеет приоритет над .env файлом
const PORT = Number(process.env.PORT) || 3333;
// 0.0.0.0 означает "слушать на всех сетевых интерфейсах"
// Это позволяет серверу быть доступным:
// - Локально: http://localhost:3333 или http://127.0.0.1:3333
// - Из сети: http://<IP-адрес>:3333
// - В контейнерах: для health checks от Instance Group
// ⚠️ В браузере нельзя перейти по 0.0.0.0 - используйте localhost!
const HOST = process.env.HOST || '0.0.0.0';

console.log('🚀 backend is running!');

// Создаем HTTP сервер
const server = http.createServer((req, res) => {
  // Health check endpoint для Instance Group
  // Yandex Cloud требует: HTTP 200 статус, быстрый ответ
  const url = req.url?.split('?')[0]; // Убираем query параметры
  
  if (url === '/health' || url === '/health/') {
    // Поддерживаем GET и HEAD запросы (некоторые health checks используют HEAD)
    const method = req.method?.toUpperCase();
    
    if (method === 'GET' || method === 'HEAD') {
      // HTTP 200 - успешный ответ
      // Content-Type для JSON (хотя для HEAD не обязательно)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      };
      
      res.writeHead(200, headers);
      
      // Для HEAD запроса не отправляем тело ответа
      if (method === 'HEAD') {
        res.end();
      } else {
        // Для GET отправляем JSON
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      }
      return;
    }
    
    // Если не GET/HEAD, возвращаем 405 Method Not Allowed
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Основной endpoint
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Hello from backend!', port: PORT }));
});

server.listen(Number(PORT), HOST, () => {
  console.log(`✅ Server is running on http://${HOST}:${PORT}`);
  console.log(`📡 Health check available at: http://${HOST}:${PORT}/health`);
});

// Обработка ошибок при запуске сервера
server.on('error', (err: NodeJS.ErrnoException) => {
  console.error('❌ Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use!`);
  } else if (err.code === 'EACCES') {
    console.error(`❌ Permission denied to bind to port ${PORT}!`);
  }
  process.exit(1);
});

// Обработка необработанных ошибок
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
