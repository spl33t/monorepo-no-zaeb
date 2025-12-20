/**
 * SSR Server entry point
 */

import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { App } from './App';
import { RouteContextProvider } from './context/RouteContext';
import { generateMetaTags, generateRouteContextScript } from './utils/seo';
import { routes } from './routes';
import { runPage, parseQuery } from '@monorepo/page-contract';

/**
 * Handle SSR request
 */
export async function handleRequest(
  request: Request,
  vite?: any
): Promise<Response> {
  const pathname = new URL(request.url).pathname;

  const match = routes._match(pathname);
  if (!match) {
    return new Response('Not Found', { status: 404 });
  }

  // Подготавливаем PageInput
  const input = {
    params: match.params,
    query: parseQuery(request.url),
    headers: Object.fromEntries(request.headers.entries()),
    request: {
      url: request.url,
      method: request.method || 'GET',
    },
  };

  // Запускаем page function
  const result = await runPage(match.route.page, input);

  // Обработка результатов
  switch (result.type) {
    case 'redirect':
      return new Response(null, {
        status: result.status || 302,
        headers: { Location: result.to },
      });

    case 'not-found':
      return new Response('Not Found', { status: 404 });

    case 'error':
      return new Response(`Error: ${result.error}`, {
        status: result.status || 500,
      });

    case 'ok':
      // Продолжаем с рендерингом
      break;
  }

  // Рендерим React
  const seoTags = result.seo ? generateMetaTags(result.seo) : '';
  const html = renderToString(
    <StaticRouter location={pathname}>
      <RouteContextProvider initialContext={result.ctx}>
        <App />
      </RouteContextProvider>
    </StaticRouter>
  );
  const routeContextScript = generateRouteContextScript(result.ctx);

  // В dev режиме используем Vite для трансформации HTML
  if (process.env.NODE_ENV === 'development' && vite) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
    let indexHtml = '';
    try {
      indexHtml = await fs.readFile(indexHtmlPath, 'utf-8');
    } catch {
      indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/client.tsx"></script>
</body>
</html>`;
    }

    const htmlWithContent = indexHtml
      .replace('<div id="root"></div>', `<div id="root">${html}</div>`)
      .replace('</head>', `${seoTags}${routeContextScript}</head>`);

    const transformed = await vite.transformIndexHtml(request.url, htmlWithContent);
    return new Response(transformed, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } else {
    // Production режим
    const clientScript = '<script type="module" src="/assets/client.js"></script>';
    const cssLinks = '<link rel="stylesheet" href="/assets/index.css">';

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cssLinks}
  ${seoTags}
  ${routeContextScript}
</head>
<body>
  <div id="root">${html}</div>
  ${clientScript}
</body>
</html>`.trim();

    return new Response(fullHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }
}
