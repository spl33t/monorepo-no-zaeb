/**
 * SSR Server based on official Vite SSR example
 * https://vite.dev/guide/ssr
 */

import express from 'express';

// Constants
const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 3000;
const base = process.env.BASE || '/';

// Create http server
const app = express();

// Add Vite or respective production middlewares
/** @type {import('vite').ViteDevServer | undefined} */
let vite;

if (!isProduction) {
  const { createServer } = await import('vite');
  
  // Vite automatically loads vite.config.ts
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    base,
  });
  
  app.use(vite.middlewares);
} else {
  const compression = (await import('compression')).default;
  const sirv = (await import('sirv')).default;
  
  app.use(compression());
  app.use(base, sirv('./dist/client', { extensions: [] }));
}

// Serve HTML
app.use('*', async (req, res) => {
  try {
    const url = req.originalUrl.replace(base, '');

    /** @type {import('./src/server.tsx').handleRequest} */
    let handleRequest;

    if (!isProduction) {
      // In development, load server module via Vite SSR
      const serverModule = await vite.ssrLoadModule('/src/server.tsx');
      handleRequest = serverModule.handleRequest;
    } else {
      // In production, server bundle is at dist/server/server.js (from vite build --ssr)
      const serverModule = await import('./dist/server/server.js');
      handleRequest = serverModule.handleRequest;
    }

    if (!handleRequest) {
      throw new Error('handleRequest not found in server module');
    }

    // Convert Express request to Web Request
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;
    
    const request = new Request(fullUrl, {
      method: req.method || 'GET',
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(', ') : value || '',
        ])
      ),
    });

    // Handle SSR request - получаем Response с полным HTML
    const response = await handleRequest(request);

    // Get response body (это полный HTML)
    let html = await response.text();

    // В dev режиме используем Vite для трансформации HTML
    // (добавляет CSS, правильные пути к скриптам из index.html)
    if (!isProduction && vite) {
      html = await vite.transformIndexHtml(req.originalUrl, html);
    }

    // Copy response headers
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.status(response.status).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(html);
  } catch (e) {
    vite?.ssrFixStacktrace(e);
    console.error('SSR Error:', e);
    res.status(500).end(e.stack || e.message || 'Internal Server Error');
  }
});

// Start http server
app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`);
  if (!isProduction) {
    console.log('📦 Using Vite SSR - no build required!');
  }
});
