/**
 * SSR Server entry point
 * Чистый рендеринг React без зависимостей от Vite
 * Следует официальному примеру Vite SSR: https://vite.dev/guide/ssr
 */

import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { App } from './App';
import { RouteContextProvider } from './context/RouteContext';
import { routes } from './routes';

/**
 * Create handleRequest function with renderHtml
 * renderHtml возвращает полный HTML (React + SEO + scripts)
 * server.js применяет vite.transformIndexHtml только в dev режиме
 */
export const handleRequest = routes.createHandleRequest({
  // Путь к клиентскому entry point
  // В dev режиме Vite обработает это через transformIndexHtml
  clientEntry: '/src/client.tsx',

  renderHtml: async (ctx, _seo, request?: Request, pageInput?) => {
    // pathname получаем из request
    const pathname = request ? new URL(request.url).pathname : '/';
    
    // Возвращаем только React контент (без HTML обертки)
    // Библиотека автоматически оборачивает в полный HTML с SEO и routeContextScript
    // SEO не передается в контекст - обновляется только при загрузке страницы
    return renderToString(
      <StaticRouter location={pathname}>
        <RouteContextProvider 
          initialContext={ctx} 
          initialPageInput={pageInput ?? null}
        >
          <App />
        </RouteContextProvider>
      </StaticRouter>
    );
  }
});
