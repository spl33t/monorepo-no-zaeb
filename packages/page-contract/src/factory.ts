/**
 * Type-safe factory for creating routes
 */

import type { PageFunction, PageInput, PageViewInput, RouteContract, SeoDescriptor } from './types';
import { handleSsrRequestFetch, type SsrFetchAdapterOptions } from './adapters/ssr-fetch';
import { handleSpaNavigation, type SpaAdapterOptions, type SpaNavigationResult } from './adapters/spa';
import { generateMetaTags as defaultGenerateMetaTags, generateRouteContextScript as defaultGenerateRouteContextScript } from './utils/seo';
import { parseQuery } from './utils';

/**
 * Generic component type (для React, Vue, и т.д.)
 */
type ComponentType<P = any> = (props: P) => any;

/**
 * Route definition with path and page function
 */
export interface RouteDefinition<Params = any, Ctx = any> {
  path: string;
  page: PageFunction<Params, Ctx>;
}

/**
 * Routes configuration object
 */
export type RoutesConfig<TRootContext = any> = {
  [key: string]: RouteDefinition<any, any>;
};

/**
 * Extract union of all route context types from RoutesConfig
 */
export type ExtractRoutesContext<TRoutes extends RoutesConfig<any>> = {
  [K in keyof TRoutes]: TRoutes[K] extends RouteDefinition<any, infer Ctx> ? Ctx : never;
}[keyof TRoutes];

/**
 * Options for createRoutes factory
 */
export interface CreateRoutesOptions<TRootContext> {
  /**
   * Function to get root context from PageInput
   * This context is available to all page functions
   */
  appContext: (input: PageInput) => TRootContext | Promise<TRootContext>;
  
  /**
   * Routes configuration object
   * Keys are route names, values are route definitions
   */
  routes: RoutesConfig<TRootContext>;
  
  /**
   * Path for 404 page (used in SPA navigation)
   * If not specified, no redirect will happen on not-found
   */
  notFoundPath?: string;
}

/**
 * Опции для создания handleRequest
 */
export interface CreateHandleRequestOptions<TRouteContext = unknown> {
  /**
   * Функция для рендеринга React контента (только body контент, без HTML обертки)
   * ctx - union всех типов контекстов роутов (автоматически выводится)
   * request передается для доступа к URL
   * Библиотека автоматически оборачивает результат в полный HTML с SEO и routeContextScript
   */
  renderHtml: (
    ctx: TRouteContext,
    seo?: SeoDescriptor,
    request?: Request,
    pageInput?: PageViewInput
  ) => string | Promise<string>;
  
  /**
   * Функция для генерации SEO meta тегов (опционально, есть дефолтная)
   */
  generateMetaTags?: (seo: SeoDescriptor) => string;
  
  /**
   * Функция для генерации скрипта с route context (опционально, есть дефолтная)
   */
  generateRouteContextScript?: (ctx: TRouteContext, pageInput?: PageViewInput) => string;
  
  /**
   * HTML шаблон для обертки контента (опционально, есть дефолтный)
   * Плейсхолдеры: {{CONTENT}} - React контент, {{SEO}} - SEO теги, {{ROUTE_CONTEXT}} - скрипт контекста, {{CLIENT_ENTRY}} - скрипт клиентского входа
   */
  htmlTemplate?: string;
  
  /**
   * Путь к клиентскому entry point (например, '/src/client.tsx' или '/client.js')
   * Используется для инжекции скрипта в HTML шаблон
   * В dev режиме Vite автоматически обрабатывает это через transformIndexHtml
   */
  clientEntry?: string;
}

/**
 * Result of createRoutes factory
 */
export interface Routes<TRootContext, TRoutesConfig extends RoutesConfig<TRootContext> = RoutesConfig<TRootContext>> {
  /**
   * Array of route contracts for direct use
   */
  _routes: RouteContract[];
  
  /**
   * Match route by pathname
   */
  _match(pathname: string): {
    route: RouteContract;
    params: Record<string, string>;
    key: string;
  } | null;
  
  /**
   * Get all route paths
   */
  _getPaths(): string[];
  
  /**
   * Get route by key
   */
  _getRoute(key: string): RouteContract | undefined;
  
  /**
   * Get app context function
   */
  _getAppContext(): (input: PageInput) => TRootContext | Promise<TRootContext>;
  
  /**
   * Create handleRequest function that knows about all routes
   * ctx автоматически имеет тип union всех контекстов роутов
   * 
   * @example
   * ```ts
   * const handleRequest = routes.createHandleRequest({
   *   renderHtml: async (ctx, seo, request) => {
   *     // ctx имеет тип HomeRouteContext | ProfileRouteContext | ProductRouteContext
   *     return renderReactApp(ctx, seo);
   *   }
   * });
   * 
   * // Использование
   * const response = await handleRequest(request, vite);
   * ```
   */
   createHandleRequest<TRouteContext = ExtractRoutesContext<TRoutesConfig>>(
     options: CreateHandleRequestOptions<TRouteContext>
   ): (request: Request) => Promise<Response>;
  
  /**
   * Map routes to React Router Route components
   * Type-safe маппинг роутов на React компоненты
   * Требует обязательного указания notFound компонента
   * 
   * @example
   * ```tsx
   * const { routes: routeComponents, notFound } = routes._mapToView({
   *   home: Home,
   *   profile: Profile,
   *   product: Product,
   *   notFound: NotFoundPage
   * });
   * 
   * <Routes>
   *   {routeComponents.map(({ key, path, Component }) => (
   *     <Route key={key} path={path} element={<Component />} />
   *   ))}
   *   <Route path="*" element={<notFound />} />
   * </Routes>
   * ```
   */
  _mapToView<TComponents extends Record<keyof TRoutesConfig, ComponentType<any>>>(options: {
    components: TComponents;
    notFound: ComponentType<any>;
  }): {
    routes: Array<{ key: string; path: string; Component: ComponentType<any> }>;
    notFound: ComponentType<any>;
  };
  
  /**
   * Handle SPA navigation with automatic route matching and PageInput preparation
   * Автоматически делает матчинг роута, подготавливает PageInput и вызывает handleSpaNavigation
   * 
   * @example
   * ```ts
   * const ctx = await routes.handleSpaNavigation(
   *   location.pathname,
   *   {
   *     searchParams: new URLSearchParams(location.search),
   *     headers: {
   *       'accept-language': navigator.language || 'en',
   *     },
   *   },
   *   {
   *     navigate: (to) => navigate(to, { replace: true }),
   *     notFoundPath: '/404',
   *   }
   * );
   * ```
   */
  handleSpaNavigation<TRouteContext = ExtractRoutesContext<TRoutesConfig>>(
    pathname: string,
    inputOptions: {
      searchParams?: URLSearchParams | Record<string, string> | string;
      headers?: Record<string, string>;
      cookies?: Record<string, string>;
    },
    spaOptions: Omit<SpaAdapterOptions, 'notFoundPath'>
  ): Promise<{ ctx: TRouteContext | null; pageInput: PageViewInput | null; seo?: SeoDescriptor | null }>;
}

/**
 * Type-safe factory for creating routes
 * 
 * @example
 * ```ts
 * const routes = createRoutes({
 *   appContext: (input) => ({
 *     requestId: crypto.randomUUID(),
 *     locale: 'en'
 *   }),
 *   routes: {
 *     home: {
 *       path: '/',
 *       page: homePage
 *     },
 *     profile: {
 *       path: '/profile/:id',
 *       page: profilePage
 *     }
 *   }
 * });
 * ```
 */
export function createRoutes<
  TRootContext = any,
  TRoutesConfig extends RoutesConfig<TRootContext> = RoutesConfig<TRootContext>
>(
  options: CreateRoutesOptions<TRootContext> & { routes: TRoutesConfig }
): Routes<TRootContext, TRoutesConfig> {
  const { routes: routesConfig, appContext, notFoundPath } = options;
  
  // Create route map for quick lookup and route contracts array
  const routeMap = new Map<string, RouteContract>();
  const keyToRoute = new Map<string, string>();
  const routeContracts: RouteContract[] = [];
  
  Object.entries(routesConfig).forEach(([key, definition]) => {
    const contract: RouteContract = {
      path: definition.path,
      page: definition.page,
    };
    routeMap.set(key, contract);
    keyToRoute.set(definition.path, key);
    routeContracts.push(contract);
  });
  
  /**
   * Match route by pathname
   */
  function matchRoute(pathname: string): {
    route: RouteContract;
    params: Record<string, string>;
    key: string;
  } | null {
    for (const [key, route] of routeMap.entries()) {
      const params = matchPath(route.path, pathname);
      if (params !== null) {
        return { route, params, key };
      }
    }
    return null;
  }
  
  /**
   * Match path pattern against pathname
   */
  function matchPath(pattern: string, pathname: string): Record<string, string> | null {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathnameParts = pathname.split('/').filter(Boolean);
    
    if (patternParts.length !== pathnameParts.length) {
      return null;
    }
    
    const params: Record<string, string> = {};
    
    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathnamePart = pathnameParts[i];
      
      if (patternPart.startsWith(':')) {
        const paramName = patternPart.slice(1);
        params[paramName] = decodeURIComponent(pathnamePart);
      } else if (patternPart !== pathnamePart) {
        return null;
      }
    }
    
    return params;
  }
  
  /**
   * Get all route paths
   */
  function getPaths(): string[] {
    return routeContracts.map((route) => route.path);
  }
  
  /**
   * Get route by key
   */
  function getRoute(key: string): RouteContract | undefined {
    return routeMap.get(key);
  }
  
  /**
   * Create handleRequest function that knows about all routes
   */
    function createHandleRequestFunction<TRouteContext = ExtractRoutesContext<TRoutesConfig>>(
      options: CreateHandleRequestOptions<TRouteContext>
    ): (request: Request) => Promise<Response> {
      return async (request: Request): Promise<Response> => {
      const pathname = new URL(request.url).pathname;
      
      const match = matchRoute(pathname);
      if (!match) {
        // 404 обрабатывается адаптером handleSsrRequestFetch
        return new Response('<html><body><h1>404 Not Found</h1></body></html>', {
          status: 404,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        });
      }
      
      // Создаем renderHtml с доступом к request через замыкание
      // ctx будет иметь тип union всех контекстов роутов
      // Библиотека автоматически оборачивает React контент в полный HTML с SEO
      // Подготавливаем PageInput для передачи в renderHtml
      // resultType будет установлен в handleSsrRequestFetch на основе результата
      // Здесь создаем базовый PageInput, который будет расширен в адаптере
      const url = new URL(request.url);
      const pageInputForRender: PageInput = {
        params: match.params,
        query: parseQuery(request.url),
        headers: Object.fromEntries(request.headers.entries()),
        request: {
          url: request.url,
          method: request.method || 'GET',
        },
      };

      const renderHtmlWithRequest = async (ctx: unknown, seo?: SeoDescriptor, _request?: Request, pageInput?: PageViewInput) => {
        // Рендерим только React контент (без HTML обертки)
        // pageInput уже содержит resultType из handleSsrRequestFetch
        const reactContent = await options.renderHtml(ctx as TRouteContext, seo, request, pageInput);
        
        // Генерируем SEO теги и routeContextScript
        const generateMetaTagsFn = options.generateMetaTags || defaultGenerateMetaTags;
        const generateRouteContextScriptFn = options.generateRouteContextScript || defaultGenerateRouteContextScript;
        
        const seoTags = seo ? generateMetaTagsFn(seo) : '';
        const routeContextScript = generateRouteContextScriptFn(ctx as TRouteContext, pageInput);
        
        // Генерируем скрипт клиентского входа
        const clientEntryScript = options.clientEntry 
          ? `  <script type="module" src="${options.clientEntry}"></script>`
          : '';
        
        // Используем кастомный шаблон или дефолтный
        const template = options.htmlTemplate || `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  {{SEO}}
  {{ROUTE_CONTEXT}}
</head>
<body>
  <div id="root">{{CONTENT}}</div>
{{CLIENT_ENTRY}}
</body>
</html>`;
        
        // Заменяем плейсхолдеры
        return template
          .replace('{{CONTENT}}', reactContent)
          .replace('{{SEO}}', seoTags)
          .replace('{{ROUTE_CONTEXT}}', routeContextScript)
          .replace('{{CLIENT_ENTRY}}', clientEntryScript);
      };
      
      // Используем адаптер для Fetch API
      // 404 и ошибки обрабатываются адаптером с дефолтными значениями
      const adapterOptions: SsrFetchAdapterOptions = {
        renderHtml: renderHtmlWithRequest,
      };
      
      return handleSsrRequestFetch(match.route, request, adapterOptions);
    };
  }
  
  /**
   * Map routes to React Router Route components
   */
  function mapToView<TComponents extends Record<keyof TRoutesConfig, ComponentType<any>>>(options: {
    components: TComponents;
    notFound: ComponentType<any>;
  }): {
    routes: Array<{ key: string; path: string; Component: ComponentType<any> }>;
    notFound: ComponentType<any>;
  } {
    const result: Array<{ key: string; path: string; Component: ComponentType<any> }> = [];
    
    for (const [key, route] of routeMap.entries()) {
      const Component = options.components[key as keyof TComponents];
      if (Component !== undefined) {
        result.push({
          key,
          path: route.path,
          Component,
        });
      }
    }
    
    return {
      routes: result,
      notFound: options.notFound,
    };
  }
  
  /**
   * Handle SPA navigation with automatic route matching and PageInput preparation
   */
  async function handleSpaNavigationFunction<TRouteContext = ExtractRoutesContext<TRoutesConfig>>(
    pathname: string,
    inputOptions: {
      searchParams?: URLSearchParams | Record<string, string> | string;
      headers?: Record<string, string>;
      cookies?: Record<string, string>;
    },
    spaOptions: Omit<SpaAdapterOptions, 'notFoundPath'>
  ): Promise<{ ctx: TRouteContext | null; pageInput: PageViewInput | null }> {
    // Match route
    const match = matchRoute(pathname);
    if (!match) {
      return {
        ctx: null,
        pageInput: null,
      };
    }
    
    // Prepare query params
    let query: Record<string, string | string[]> = {};
    if (inputOptions.searchParams) {
      if (inputOptions.searchParams instanceof URLSearchParams) {
        query = Object.fromEntries(inputOptions.searchParams.entries());
      } else if (typeof inputOptions.searchParams === 'string') {
        query = parseQuery('?' + inputOptions.searchParams);
      } else {
        query = inputOptions.searchParams;
      }
    }
    
    // Prepare PageInput
    const searchString = inputOptions.searchParams 
      ? (typeof inputOptions.searchParams === 'string' 
          ? inputOptions.searchParams 
          : '?' + new URLSearchParams(inputOptions.searchParams as Record<string, string>).toString())
      : '';
    
    const input: PageInput = {
      params: match.params,
      query,
      ...(inputOptions.headers && { headers: inputOptions.headers }),
      ...(inputOptions.cookies && { cookies: inputOptions.cookies }),
      request: {
        url: pathname + searchString,
        method: 'GET',
      },
    };
    
    // Call handleSpaNavigation with notFoundPath from routes config (if specified)
    const result = await handleSpaNavigation(match.route, input, {
      ...spaOptions,
      ...(notFoundPath && { notFoundPath }),
    }) as SpaNavigationResult<TRouteContext>;
    
    return {
      ctx: result.ctx as TRouteContext | null,
      pageInput: result.pageInput,
      seo: result.seo ?? null,
    };
  }
  
  return {
    _routes: routeContracts,
    _match: matchRoute,
    _getPaths: getPaths,
    _getRoute: getRoute,
    _getAppContext: () => appContext,
    createHandleRequest: createHandleRequestFunction,
    _mapToView: mapToView,
    handleSpaNavigation: handleSpaNavigationFunction,
  };
}
