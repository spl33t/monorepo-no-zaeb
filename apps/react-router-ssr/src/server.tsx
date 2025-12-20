/**
 * SSR Server entry point
 * Чистый рендеринг React без зависимостей от Vite
 * Следует официальному примеру Vite SSR: https://vite.dev/guide/ssr
 */

import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { App } from './App';
import { RouteContextProvider } from './context/RouteContext';
import { generateMetaTags, generateRouteContextScript } from './utils/seo';
import { routes } from './routes';

/**
 * Create handleRequest function with renderHtml
 * renderHtml возвращает полный HTML (React + SEO + scripts)
 * server.js применяет vite.transformIndexHtml только в dev режиме
 */
export const handleRequest = routes.createHandleRequest({
  renderHtml: async (ctx, seo?: any, request?: Request) => {
    // pathname получаем из request
    const pathname = request ? new URL(request.url).pathname : '/';
    
    const seoTags = seo ? generateMetaTags(seo) : '';
    const html = renderToString(
      <StaticRouter location={pathname}>
        <RouteContextProvider initialContext={ctx}>
          <App />
        </RouteContextProvider>
      </StaticRouter>
    );
    const routeContextScript = generateRouteContextScript(ctx);

    // Возвращаем полный HTML (React + SEO + scripts)
    // server.js применит vite.transformIndexHtml только в dev режиме
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${seoTags}
  ${routeContextScript}
</head>
<body>
  <div id="root">${html}</div>
</body>
</html>`.trim();
  },
  render404: () => '<html><body><h1>404 Not Found</h1></body></html>',
  renderError: (error, status) =>
    `<html><body><h1>Error ${status || 500}</h1><p>${error}</p></body></html>`,
});
