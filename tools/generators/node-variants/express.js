const fs = require('fs');
const path = require('path');

/**
 * Генерирует специфичные файлы для Express/Plain Node.js приложения
 * @param {string} appDir - Директория приложения
 * @param {string} name - Название приложения
 * @param {string} port - Порт приложения
 */
function generateExpressFiles(appDir, name, port) {
  // package.json dependencies (пустые для plain Node.js)
  const dependencies = {};
  const devDependencies = {};

  // src/index.ts
  const indexContent = `import { config } from 'dotenv';
config({ path: '.env', override: true });
import http from 'http';

const PORT = process.env.PORT || ${port};
const HOST = '0.0.0.0';

console.log('🚀 ${name} is running!');
console.log(\`📦 NODE_ENV: \${process.env.NODE_ENV || 'not set'}\`);

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
  res.end(JSON.stringify({ message: 'Hello from ${name}!', port: PORT }));
});

server.listen(Number(PORT), HOST, () => {
  console.log(\`✅ Server is running on http://\${HOST}:\${PORT}\`);
});
`;
  fs.writeFileSync(path.join(appDir, 'src/index.ts'), indexContent);

  return {
    dependencies,
    devDependencies,
    entryPath: 'src/index.ts',
    structure: [
      '  └── index.ts'
    ]
  };
}

module.exports = { generateExpressFiles };
