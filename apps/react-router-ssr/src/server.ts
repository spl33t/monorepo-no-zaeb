/**
 * Server entry point (Development & Production)
 */

import { renderToString } from 'react-dom/server';
import { app } from './app';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Определяем режим
const isProd = process.env.NODE_ENV === 'production';

// Определяем путь к клиентскому bundle для production
async function getProdClientEntry(): Promise<string> {
  // В dev режиме просто возвращаем fallback (не используется)
  if (!isProd) {
    return '/assets/main.js';
  }
  
  // В production пытаемся найти bundle
  // __dirname указывает на dist/server в production
  const clientDir = join(__dirname, '../client');
  const assetsDir = join(clientDir, 'assets');
  
  try {
    const files = await readdir(assetsDir);
    const jsFile = files.find(f => f.endsWith('.js') && f.startsWith('main-'));
    if (jsFile) {
      // Возвращаем путь относительно base (будет '/' по умолчанию)
      return `/assets/${jsFile}`;
    }
  } catch (e) {
    console.warn('Could not find client bundle:', e);
  }
  
  // Fallback
  return '/assets/main.js';
}

(async () => {
  const prodClientEntry = await getProdClientEntry();
  
  // Можно переопределить через переменную окружения
  // Например: CDN_URL=https://cdn.example.com/assets/main-CJb-m_c0.js
  const cdnUrl = process.env.CDN_URL;
  const finalProdEntry = cdnUrl || prodClientEntry;
  
app.runServer({
    port: Number(process.env.PORT) || 3000,
  renderToString,
    clientEntry: {
      dev: '/src/client.tsx',
      prod: finalProdEntry,
    },
    isProd, // Автоматически определяется из NODE_ENV
    // disableStaticFiles теперь определяется автоматически:
    // - В dev: статика через Vite
    // - В prod с локальным bundle: статика через sirv
    // - В prod с CDN: статика не нужна на сервере
});
})();

