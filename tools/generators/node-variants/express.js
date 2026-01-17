const fs = require('fs');
const path = require('path');

/**
 * Генерирует специфичные файлы для Express/Plain Node.js приложения
 * @param {string} appDir - Директория приложения
 * @param {string} name - Название приложения
 * @param {string} port - Порт приложения
 */
function generateExpressFiles(appDir, name, port) {
  // package.json dependencies для Express
  const dependencies = {
    'express': '^4.18.2'
  };
  const devDependencies = {
    '@types/express': '^4.17.21'
  };

  // src/index.ts
  const indexContent = `import { config } from 'dotenv';
config({ path: '.env', override: true });

import express from 'express';

const PORT = process.env.PORT!;
const HOST = '0.0.0.0';

const app = express();

// Middleware для парсинга JSON
app.use(express.json());

console.log('🚀 ${name} is running!');
console.log(\`📦 NODE_ENV: \${process.env.NODE_ENV || 'not set'}\`);

// Health check endpoint для Instance Group
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Основной endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Hello from ${name}!', port: PORT });
});

app.listen(Number(PORT), HOST, () => {
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
