#!/usr/bin/env node

/**
 * SEO Gateway - сервер для генерации HTML с SEO мета-тегами
 * Использует createSeoServer из @monorepo/contract-page-2
 */

import 'dotenv/config';
import path from 'path';
import { createSeoServer } from '@monorepo/contract-page-2';
import { contract } from '@monorepo/core';

const isDev = process.env.NODE_ENV !== 'production';
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

// Определяем clientBundleUrl в зависимости от окружения
let clientBundleUrl: string;

if (isDev) {
  // В dev режиме используем путь к dist папке
  // SEO Gateway будет читать index.html из dist и извлекать скрипты/стили
  clientBundleUrl = process.env.CLIENT_BUNDLE_URL || '../../rick-and-morty/dist';
} else {
  // В production используем URL из CDN или env переменной
  clientBundleUrl = process.env.CLIENT_BUNDLE_URL || 'https://cdn.example.com/dist/client/main.js';
}

const gateway = createSeoServer(contract, {
  port: PORT,
  host: HOST,
  clientBundleUrl,
  baseDir: __dirname,
});

gateway.listen(() => {
  console.log(`\n🚀 SEO Gateway запущен в ${isDev ? 'dev' : 'production'} режиме!`);
  console.log(`📦 Клиентский бандл: ${clientBundleUrl}`);
  if (isDev) {
    console.log(`\n💡 Убедитесь, что приложение собрано в dist папку`);
  }
});
