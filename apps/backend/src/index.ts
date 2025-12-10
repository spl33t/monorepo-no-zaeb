#!/usr/bin/env node

import 'dotenv/config';
import http from 'http';

const PORT = process.env.PORT || 3333;
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
  // Обрабатываем /health и /health/ (с trailing slash)
  const url = req.url?.split('?')[0]; // Убираем query параметры
  if (url === '/health' || url === '/health/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Основной endpoint
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Hello from backend!', port: PORT }));
});

server.listen(Number(PORT), HOST, () => {
  console.log(`✅ Server is running on http://${HOST}:${PORT}`);
});
