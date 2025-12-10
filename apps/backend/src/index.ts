#!/usr/bin/env node

import 'dotenv/config';
import http from 'http';

const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 работает и локально, и в контейнерах

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
