/**
 * Type-safe factory for creating routes
 */

import type { PageFunction, PageInput, RouteContract } from './types';

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
 * Result of createRoutes factory
 */
export interface Routes<TRootContext> {
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
export function createRoutes<TRootContext = any>(
  options: CreateRoutesOptions<TRootContext>
): Routes<TRootContext> {
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
  
  return {
    _routes: routeContracts,
    _match: matchRoute,
    _getPaths: getPaths,
    _getRoute: getRoute,
    _getAppContext: () => appContext,
  };
}
