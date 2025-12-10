#!/usr/bin/env node

import 'dotenv/config';
import http from 'http';

const PORT = process.env.PORT || 3333;

console.log('🚀 backend is running!');

// Создаем HTTP сервер
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Hello from backend!', port: PORT }));
});

server.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
