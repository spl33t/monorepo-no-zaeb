/**
 * Client entry point
 */

import { createRoot } from 'react-dom/client';
import { app } from './app';
import './index.css';

// Определяем режим продакшн
const isProd = process.env.NODE_ENV === 'production';

app.runClient({
  createRoot,
  isProd,
});

