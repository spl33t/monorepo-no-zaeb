// SPA Enhancement для contract-page-2
// Этот файл содержит enhanceContractWithSPA и связанные функции

import type { Contract, RuntimeContext } from './index';

const navigationCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 100;

export function enhanceContractWithSPA<AppCtx>(contract: Contract<AppCtx, any>) {
  const createAppComponent = (options: any) => {
    const { React, renderApp, notFound, loading } = options;
    const { useState, useEffect, createElement } = React;

    const AppComponent = ({
      appContext: ssrAppContext,
      ssrUrl,
      ssrPageContext,
      ssrParams,
      isProd: isProdProp,
    }: {
      appContext?: AppCtx;
      ssrUrl?: string;
      ssrPageContext?: any;
      ssrParams?: Record<string, string>;
      isProd?: boolean;
    }) => {
      // Определяем режим продакшн (из пропа или из окружения)
      const isProduction = isProdProp !== undefined 
        ? isProdProp 
        : process.env.NODE_ENV === 'production';
      const isSSR = typeof window === 'undefined';
      const [url, setUrl] = useState(
        ssrUrl || (typeof window !== 'undefined' ? window.location.pathname : '/')
      );
      const [pageContext, setPageContext] = useState(
        ssrPageContext || (typeof window !== 'undefined' ? (window as any).__INITIAL_DATA__ : null)
      );
      const [isLoading, setIsLoading] = useState(false);
      
      // Инициализация appContext из window.__APP_CTX__ если есть (для hydration)
      const [appContextState, setAppContextState] = useState(
        isSSR 
          ? ssrAppContext 
          : (typeof window !== 'undefined' ? (window as any).__APP_CTX__ : undefined) as AppCtx | undefined
      );
      const [isLoadingAppContext, setIsLoadingAppContext] = useState(false);

      // Обработка popstate события
      useEffect(() => {
        if (isSSR) return;
        const onPopState = () => setUrl(window.location.pathname);
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
      }, []);

      // Загрузка appContext (но не при hydration)
      useEffect(() => {
        if (isSSR) return;
        const contractWithGetAppContext = contract as any;
        if (!('getAppContext' in contractWithGetAppContext) || !contractWithGetAppContext.getAppContext) {
          return;
        }

        // Проверяем, является ли страница not found
        const matched = contract.matchRoute(url);
        const isNotFound = !matched.page;

        // Проверяем, является ли это hydration (первая загрузка с SSR данными)
        // Для обычных страниц есть window.__INITIAL_DATA__, для not found может быть null
        // Но для обеих может быть window.__APP_CTX__ если appContext вычислялся на сервере
        const isInitialLoad = url === window.location.pathname;
        const hasInitialAppContext = isInitialLoad && (window as any).__APP_CTX__ !== undefined;
        const hasInitialData = (window as any).__INITIAL_DATA__ !== undefined;
        
        // При hydration используем window.__APP_CTX__ если есть, не загружаем повторно
        // Это работает и для обычных страниц, и для not found страниц
        // Для not found страницы __INITIAL_DATA__ может быть null, но __APP_CTX__ может быть установлен
        if (hasInitialAppContext && (hasInitialData || isNotFound)) {
          // window.__APP_CTX__ уже использован в useState инициализации (строка 38)
          // Очищаем его после первого использования, чтобы при следующих навигациях загружался новый
          delete (window as any).__APP_CTX__;
          return;
        }

        // Для всех страниц (включая not-found) при каждой навигации загружаем appContext
        setIsLoadingAppContext(true);
        const runtimeCtx: RuntimeContext = { url };
        Promise.resolve(contractWithGetAppContext.getAppContext(runtimeCtx))
          .then((newAppContext: AppCtx) => {
            setAppContextState(newAppContext);
            setIsLoadingAppContext(false);
          })
          .catch((err: any) => {
            if (!isProduction) {
              console.error('Failed to get app context:', err);
            }
            setIsLoadingAppContext(false);
          });
      }, [url]);

      // Загрузка pageContext
      useEffect(() => {
        if (isSSR) return;

        const initialData = (window as any).__INITIAL_DATA__;
        if (initialData && url === window.location.pathname) {
          if (initialData.type === 'redirect') {
            const targetUrl = initialData.to;
            if (targetUrl !== url) {
              window.history.replaceState({}, '', targetUrl);
              setUrl(targetUrl);
              delete (window as any).__INITIAL_DATA__;
              return;
            }
            delete (window as any).__INITIAL_DATA__;
            return;
          }
          setPageContext(initialData);
          delete (window as any).__INITIAL_DATA__;
          return;
        }

        const cached = navigationCache.get(url);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          const data = cached.data;
          navigationCache.delete(url);
          if (data.type === 'redirect') {
            const targetUrl = data.to;
            if (targetUrl !== url) {
              window.history.replaceState({}, '', targetUrl);
              setUrl(targetUrl);
              return;
            }
          }
          setPageContext(data);
          setIsLoading(false);
          return;
        }

        setPageContext(null);
        setIsLoading(true);
        fetch(`/api/page?url=${encodeURIComponent(url)}`)
          .then((res) => {
            if (res.status === 302 || res.status === 301) {
              const location = res.headers.get('Location');
              if (location) {
                const targetUrl = new URL(location, window.location.origin).pathname;
                setIsLoading(false);
                window.history.replaceState({}, '', targetUrl);
                setUrl(targetUrl);
                return null;
              }
            }
            return res.json();
          })
          .then((data) => {
            if (!data) return;
            if (data.type === 'redirect') {
              const targetUrl = data.to;
              if (targetUrl !== url) {
                setIsLoading(false);
                window.history.replaceState({}, '', targetUrl);
                setUrl(targetUrl);
                return;
              }
              setIsLoading(false);
              return;
            }
            setPageContext(data);
            setIsLoading(false);
          })
          .catch((err) => {
            if (!isProduction) {
              console.error('Failed to fetch page data:', err);
            }
            setPageContext({ type: 'error', error: err.message });
            setIsLoading(false);
          });
      }, [url]);

      const matched = contract.matchRoute(url);
      const { page, component: PageComponent } = matched as any;
      const params = ssrParams || matched.params;
      const needsAppContext = 'getAppContext' in contract;
      const appContextReady = !needsAppContext || (appContextState !== undefined && !isLoadingAppContext);

      let routerOutput;
      if (!page || !PageComponent) {
        routerOutput = notFound ? notFound() : createElement('div', null, '404 Not Found');
      } else if (!appContextReady || isLoading || !pageContext) {
        routerOutput = loading ? loading() : createElement('div', null, 'Loading...');
      } else {
        const pageProps: any = {
          pageContext,
          params,
        };
        if ('getAppContext' in contract) {
          pageProps.appContext = appContextState;
        }
        routerOutput = createElement(PageComponent, pageProps);
      }

      const currentAppContext = isSSR ? ssrAppContext : appContextState;
      return renderApp(
        currentAppContext !== undefined
          ? { router: routerOutput, appContext: currentAppContext }
          : { router: routerOutput }
      );
    };

    return { AppComponent };
  };

  return {
    ...contract,
    defineApp: (options: any) => {
      const { React, renderApp, notFound, loading } = options;
      const { createElement } = React;
      const { AppComponent } = createAppComponent(options);

      const createServerRunner = (() => {
        const isServer = typeof window === 'undefined';
        if (!isServer) {
          return (_routerOpts: any) => (_serverOptions: any) => {
            throw new Error('runServer can only be called on the server');
          };
        }

        return (_routerOpts: any) => (serverOptions: any) => {
          const {
            port = 3000,
            base = '/',
            renderToString,
            clientEntry: providedEntry,
            isProd: explicitIsProd,
          } = serverOptions;

          const isProduction =
            explicitIsProd !== undefined
              ? explicitIsProd
              : process.env.NODE_ENV === 'production';

          let clientEntry: string;
          if (typeof providedEntry === 'object' && providedEntry !== null) {
            clientEntry = isProduction ? providedEntry.prod : providedEntry.dev;
          } else if (typeof providedEntry === 'string') {
            clientEntry = providedEntry;
          } else {
            if (isProduction) {
              clientEntry = '/assets/main.js';
            } else {
              clientEntry = '/src/client.tsx';
            }
          }

          (async () => {
            const expressModule = 'express';
            const corsModule = 'cors';
            const express = (await import(/* @vite-ignore */ expressModule)).default;
            const cors = (await import(/* @vite-ignore */ corsModule)).default;

            const app = express();
            let vite: any;

            // Production оптимизации
            if (isProduction) {
              // Compression (gzip) для всех ответов
              try {
                const compressionModule = 'compression';
                const compression = (await import(/* @vite-ignore */ compressionModule)).default;
                app.use(compression());
              } catch (e) {
                console.warn('Compression middleware not available:', e);
              }
            }

            if (!isProduction) {
              const viteModule = 'vite';
              const { createServer } = await import(/* @vite-ignore */ viteModule);
              vite = await createServer({
                server: { middlewareMode: true },
                appType: 'custom',
                base,
              });
              app.use(vite.middlewares);
            } else {
              const isCdnUrl =
                clientEntry && (clientEntry.startsWith('http://') || clientEntry.startsWith('https://'));
              if (!isCdnUrl) {
                try {
                  const sirvModule = 'sirv';
                  const pathModule = 'path';
                  const urlModule = 'url';
                  const { default: sirv } = await import(/* @vite-ignore */ sirvModule);
                  const { resolve, dirname } = await import(/* @vite-ignore */ pathModule);
                  const { fileURLToPath } = await import(/* @vite-ignore */ urlModule);

                  const serverFile = fileURLToPath(import.meta.url);
                  const serverDir = dirname(serverFile);
                  const clientDir = resolve(serverDir, '../client');

                  // Оптимизированная конфигурация sirv для продакшн
                  app.use(
                    base,
                    sirv(clientDir, {
                      extensions: [],
                      gzip: true, // Включаем gzip для статики (дополнительно к compression middleware)
                      maxAge: 31536000, // 1 год кеширования для статики
                      immutable: true, // Файлы с хешами считаются immutable
                    })
                  );
                } catch (e) {
                  console.warn('Static file serving not available:', e);
                }
              }
            }

            app.use(express.json());
            app.use(cors());

            const contractWithGetAppContext = contract as any;

            // API endpoint для SPA навигации
            app.get('/api/page', async (req: any, res: any) => {
              const url = req.query.url;
              if (!url || typeof url !== 'string') {
                return res.status(400).json({ error: 'url required' });
              }

              const { page, params } = contract.matchRoute(url);
              if (!page) {
                return res.status(404).json({ type: 'not-found' });
              }

              const runtimeCtx: RuntimeContext = { url };
              let result;
              if (
                'getAppContext' in contractWithGetAppContext &&
                contractWithGetAppContext.getAppContext
              ) {
                const appContext = await contractWithGetAppContext.getAppContext(runtimeCtx);
                result = await (page.page as any)({ appContext, params });
              } else {
                result = await (page.page as any)({ params });
              }

              if (result.type === 'redirect') {
                return res.status(result.status || 302).json(result);
              }
              if (result.type === 'not-found') {
                return res.status(404).json(result);
              }

              res.json(result);
            });

            // SSR endpoint
            app.get('*', async (req: any, res: any) => {
              try {
                const url = (req.originalUrl?.replace(base, '') || req.url) as string;

                const { page, params } = contract.matchRoute(url);
                if (!page) {
                  // Not found - рендерим AppComponent с notFound
                  let appContextForNotFound: AppCtx | undefined;
                  if (
                    'getAppContext' in contractWithGetAppContext &&
                    contractWithGetAppContext.getAppContext
                  ) {
                    const runtimeCtx: RuntimeContext = { url };
                    appContextForNotFound = await contractWithGetAppContext.getAppContext(runtimeCtx);
                  }

                  const appHtml = renderToString(
                    createElement(AppComponent, {
                      appContext: appContextForNotFound,
                      ssrUrl: url,
                      ssrPageContext: null,
                      ssrParams: {},
                    })
                  );

                  const html = `
                    <!DOCTYPE html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>App</title>
                      </head>
                      <body>
                        <div id="root">${appHtml}</div>
                        <script>
                          window.__INITIAL_DATA__ = null;
                          window.__INITIAL_PARAMS__ = {};
                          ${appContextForNotFound ? `window.__APP_CTX__ = ${JSON.stringify(appContextForNotFound)};` : ''}
                        </script>
                        <script type="module" src="${clientEntry}"></script>
                      </body>
                    </html>
                  `;

                  if (!isProduction && vite) {
                    const transformedHtml = await vite.transformIndexHtml(req.originalUrl || req.url, html);
                    return res.status(404).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(transformedHtml);
                  }
                  
                  // Production заголовки для HTML
                  const headers: Record<string, string> = {
                    'Content-Type': 'text/html; charset=utf-8',
                  };
                  if (isProduction) {
                    // HTML не кешируем (динамический контент), но добавляем заголовки безопасности
                    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
                    headers['Pragma'] = 'no-cache';
                    headers['Expires'] = '0';
                    headers['X-Content-Type-Options'] = 'nosniff';
                  }
                  
                  return res.status(404).set(headers).send(html);
                }

                // Обычная страница
                const runtimeCtx: RuntimeContext = { url };
                let result: any;
                let appContext: AppCtx | undefined;

                if (
                  'getAppContext' in contractWithGetAppContext &&
                  contractWithGetAppContext.getAppContext
                ) {
                  appContext = await contractWithGetAppContext.getAppContext(runtimeCtx);
                  result = await (page.page as any)({ appContext, params });
                } else {
                  result = await (page.page as any)({ params });
                }

                if (result.type === 'redirect') {
                  return res.redirect(result.status || 302, result.to);
                }

                const appHtml = renderToString(
                  createElement(AppComponent, {
                    appContext,
                    ssrUrl: url,
                    ssrPageContext: result,
                    ssrParams: params,
                  })
                );

                let html = `
                  <!DOCTYPE html>
                  <html lang="en">
                    <head>
                      <meta charset="UTF-8">
                      <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      <title>App</title>
                    </head>
                    <body>
                      <div id="root">${appHtml}</div>
                      <script>
                        window.__INITIAL_DATA__ = ${JSON.stringify(result)};
                        window.__INITIAL_PARAMS__ = ${JSON.stringify(params)};
                        ${appContext ? `window.__APP_CTX__ = ${JSON.stringify(appContext)};` : ''}
                      </script>
                      <script type="module" src="${clientEntry}"></script>
                    </body>
                  </html>
                `;

                if (!isProduction && vite) {
                  html = await vite.transformIndexHtml(req.originalUrl || req.url, html);
                }

                const status = result.type === 'not-found' ? 404 : 200;
                
                // Production заголовки для HTML
                const headers: Record<string, string> = {
                  'Content-Type': 'text/html; charset=utf-8',
                };
                if (isProduction) {
                  // HTML не кешируем (динамический контент), но добавляем заголовки безопасности
                  headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
                  headers['Pragma'] = 'no-cache';
                  headers['Expires'] = '0';
                  headers['X-Content-Type-Options'] = 'nosniff';
                }
                
                res.status(status).set(headers).send(html);
              } catch (e: any) {
                if (vite) {
                  vite.ssrFixStacktrace(e);
                }
                console.error('SSR Error:', e);
                res.status(500).send(e.stack || e.message || 'Internal Server Error');
              }
            });

            const server = app.listen(port, () => {
              console.log(`Server running at http://localhost:${port}`);
              if (!isProduction) {
                console.log('📦 Using Vite SSR - no build required!');
              }
            });

            // Обработка ошибок при запуске сервера
            server.on('error', (err: NodeJS.ErrnoException) => {
              console.error('❌ Server error:', err);
              if (err.code === 'EADDRINUSE') {
                console.error(`❌ Port ${port} is already in use!`);
                console.error(`💡 Try one of these solutions:`);
                console.error(`   1. Stop the process using port ${port}`);
                console.error(`   2. Use a different port: PORT=3001 npm run dev`);
                console.error(`   3. Find and kill the process: npx kill-port ${port}`);
              } else if (err.code === 'EACCES') {
                console.error(`❌ Permission denied to bind to port ${port}!`);
                console.error(`💡 Try using a port above 1024 or run with elevated permissions`);
              }
              process.exit(1);
            });
          })();
        };
      })();

      return {
        runServer: createServerRunner({ notFound, loading, renderApp }),
        runClient: (clientOptions: any) => {
          const { createRoot, isProd: explicitIsProd } = clientOptions;
          
          // Определяем режим продакшн
          const isProduction =
            explicitIsProd !== undefined
              ? explicitIsProd
              : process.env.NODE_ENV === 'production';
          
          const rootEl = document.getElementById('root');
          if (!rootEl) {
            throw new Error('Root element not found');
          }

          createRoot(rootEl).render(
            createElement(AppComponent, {
              appContext: undefined, // Будет пересчитан в useEffect
              isProd: isProduction, // Передаем isProd в компонент для клиентских оптимизаций
            })
          );
        },
      };
    },
  };
}

// Navigate function для SPA
export function navigateTo(url: string) {
  if (typeof window === 'undefined') return;

  // Нормализуем URL для сравнения (убираем query и hash)
  const normalizeUrl = (u: string) => {
    try {
      const urlObj = new URL(u, window.location.origin);
      return urlObj.pathname;
    } catch {
      // Если URL относительный, просто возвращаем его
      return u.split('?')[0].split('#')[0];
    }
  };

  const normalizedUrl = normalizeUrl(url);
  const currentPath = normalizeUrl(window.location.pathname);

  // Если URL совпадает с текущим, не делаем навигацию
  if (normalizedUrl === currentPath) {
    return;
  }

  (async () => {
    try {
      const response = await fetch(`/api/page?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (data.type === 'redirect') {
        const targetUrl = data.to;
        if (targetUrl !== url) {
          navigationCache.delete(url);
          window.history.replaceState({}, '', targetUrl);
          window.dispatchEvent(new PopStateEvent('popstate'));
          return;
        }
      }

      navigationCache.set(url, { data, timestamp: Date.now() });
      window.history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
      console.error('Failed to navigate:', error);
      window.history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  })();
}

