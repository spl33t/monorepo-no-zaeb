import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

// Читаем PORT из .env файла
function getPortFromEnv(): number {
  const envPath = path.resolve(__dirname, '.env');
  
  // Проверяем существование файла
  try {
    readFileSync(envPath, 'utf-8');
  } catch (error) {
    throw new Error(`❌ Файл .env не найден: ${envPath}`);
  }
  
  // Читаем содержимое файла
  const envContent = readFileSync(envPath, 'utf-8');
  const portMatch = envContent.match(/^PORT=(\d+)/m);
  
  if (!portMatch) {
    throw new Error(`❌ Переменная PORT не найдена в файле .env: ${envPath}`);
  }
  
  return parseInt(portMatch[1], 10);
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: getPortFromEnv(),
    host: '0.0.0.0',
  },
  preview: {
    port: getPortFromEnv(),
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@monorepo': path.resolve(__dirname, '../../packages')
    }
  }
});
