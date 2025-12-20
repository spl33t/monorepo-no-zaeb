/**
 * Type-safe factory for creating routes
 */

import type { PageFunction, PageInput, RouteContract, SeoDescriptor } from './types';
import { handleSsrRequestFetch, type SsrFetchAdapterOptions } from './adapters/ssr-fetch';

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
}

/**
 * Опции для создания handleRequest
 */
export interface CreateHandleRequestOptions<TRouteContext = unknown> {
  /**
   * Функция для рендеринга HTML страницы
   * ctx - union всех типов контекстов роутов (автоматически выводится)
   * request передается для доступа к URL
   */
  renderHtml: (ctx: TRouteContext, seo?: SeoDescriptor, request?: Request) => string | Promise<string>;
  
  /**
   * Функция для рендеринга 404 страницы
   */
  render404?: () => string | Promise<string>;
  
  /**
   * Функция для рендеринга страницы ошибки
   */
  renderError?: (error: unknown, status?: number) => string | Promise<string>;
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
   * 
   * @example
   * ```tsx
   * <Routes>
   *   {routes._mapToView({
   *     home: Home,
   *     profile: Profile,
   *     product: Product
   *   }).map(({ key, path, Component }) => (
   *     <Route key={key} path={path} element={<Component />} />
   *   ))}
   * </Routes>
   * ```
   */
  _mapToView<TComponents extends Record<keyof TRoutesConfig, ComponentType<any>>>(
    components: TComponents
  ): Array<{ key: string; path: string; Component: ComponentType<any> }>;
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
  const { routes: routesConfig, appContext } = options;
  
  // Convert routes config to RouteContract array
  const routeContracts: RouteContract[] = Object.entries(routesConfig).map(
    ([_key, definition]) => ({
      path: definition.path,
      page: definition.page,
    })
  );
  
  // Create route map for quick lookup
  const routeMap = new Map<string, RouteContract>();
  const keyToRoute = new Map<string, string>();
  
  Object.entries(routesConfig).forEach(([key, definition]) => {
    const contract: RouteContract = {
      path: definition.path,
      page: definition.page,
    };
    routeMap.set(key, contract);
    keyToRoute.set(definition.path, key);
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
        const notFoundHtml = options.render404
          ? await options.render404()
          : '<html><body><h1>404 Not Found</h1></body></html>';
        return new Response(notFoundHtml, {
          status: 404,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        });
      }
      
      // Создаем renderHtml с доступом к request через замыкание
      // ctx будет иметь тип union всех контекстов роутов
      const renderHtmlWithRequest = async (ctx: unknown, seo?: SeoDescriptor) => {
        return options.renderHtml(ctx as TRouteContext, seo, request);
      };
      
      // Используем адаптер для Fetch API
      const adapterOptions: SsrFetchAdapterOptions = {
        renderHtml: renderHtmlWithRequest,
      };
      
      if (options.render404) {
        adapterOptions.render404 = options.render404;
      }
      
      if (options.renderError) {
        adapterOptions.renderError = options.renderError;
      }
      
      return handleSsrRequestFetch(match.route, request, adapterOptions);
    };
  }
  
  /**
   * Map routes to React Router Route components
   */
  function mapToView<TComponents extends Record<keyof TRoutesConfig, ComponentType<any>>>(
    components: TComponents
  ): Array<{ key: string; path: string; Component: ComponentType<any> }> {
    const result: Array<{ key: string; path: string; Component: ComponentType<any> }> = [];
    
    for (const [key, route] of routeMap.entries()) {
      const Component = components[key as keyof TComponents];
      if (Component !== undefined) {
        result.push({
          key,
          path: route.path,
          Component,
        });
      }
    }
    
    return result;
  }
  
  return {
    _routes: routeContracts,
    _match: matchRoute,
    _getPaths: getPaths,
    _getRoute: getRoute,
    _getAppContext: () => appContext,
    createHandleRequest: createHandleRequestFunction,
    _mapToView: mapToView,
  };
}
