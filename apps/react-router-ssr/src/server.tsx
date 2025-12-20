/**
 * SSR Server entry point
 */

import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { App } from './App';
import { RouteContextProvider, generateMetaTags, generateRouteContextScript } from '@monorepo/routes-ssr';
import { routes } from './routes';
import type { AppRootContext } from './routes';

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

  const rootContext: AppRootContext = {
    requestId: crypto.randomUUID(),
    locale: (request.headers.get('Accept-Language')?.includes('ru')
      ? 'ru'
      : 'en') as 'ru' | 'en',
    session: {
      userId: request.headers.get('X-User-Id') || null,
      role: (request.headers.get('X-User-Role') as any) || null,
    },
  };

  const pageResult = await match.route.page(match.params as any, rootContext);

  // Handle different result types with appropriate HTTP status codes
  switch (pageResult.type) {
    case 'redirect':
      // For SSR redirects, return HTTP redirect
      // The browser will make a new request to the redirect target
      // If the target route doesn't exist, it will be handled by the next request
      return new Response(null, {
        status: pageResult.status || 302,
        headers: { Location: pageResult.to },
      });

    case 'notFound':
      return new Response('Not Found', { status: 404 });

    case 'gone':
      return new Response('Gone', { status: 410 });

    case 'forbidden':
      return new Response('Forbidden', { status: 403 });

    case 'unauthorized':
      return new Response('Unauthorized', { status: 401 });

    case 'unavailableForLegalReasons':
      return new Response('Unavailable For Legal Reasons', { status: 451 });

    case 'ok':
      // Continue with normal rendering
      break;
  }

  const seoTags = pageResult.seo ? generateMetaTags(pageResult.seo) : '';
  const html = renderToString(
    <StaticRouter location={pathname}>
      <RouteContextProvider initialContext={pageResult.routeContext}>
        <App />
      </RouteContextProvider>
    </StaticRouter>
  );
  const routeContextScript = generateRouteContextScript(pageResult.routeContext);
  
  // In dev mode, use Vite dev server; in production, use built bundle
  if (process.env.NODE_ENV === 'development' && vite) {
    // Use Vite to transform index.html and get proper CSS/JS links
    // Read the actual index.html file
    const fs = await import('fs/promises');
    const path = await import('path');
    const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
    let indexHtml = '';
    try {
      indexHtml = await fs.readFile(indexHtmlPath, 'utf-8');
    } catch {
      // Fallback template if index.html doesn't exist
      indexHtml = `<!DOCTYPE html>
<html lang="${rootContext.locale}">
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
    
    // Replace root div with SSR content and inject SEO/context
    const htmlWithContent = indexHtml
      .replace('<div id="root"></div>', `<div id="root">${html}</div>`)
      .replace('</head>', `${seoTags}${routeContextScript}</head>`);
    
    // Transform HTML with Vite to inject CSS and proper script tags
    const transformed = await vite.transformIndexHtml(request.url, htmlWithContent);
    return new Response(transformed, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } else {
    // Production: use built bundle
    const clientScript = '<script type="module" src="/assets/client.js"></script>';
    const cssLinks = '<link rel="stylesheet" href="/assets/index.css">';

    const fullHtml = `
<!DOCTYPE html>
<html lang="${rootContext.locale}">
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
</html>
    `.trim();

    return new Response(fullHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }
}

