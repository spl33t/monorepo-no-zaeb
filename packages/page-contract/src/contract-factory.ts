/**
 * Main factory for initializing page-contract with app context
 * This is the entry point for applications using the library
 */

import type { PageInput, PageFunction, PageResult } from './types';
import type { PageHandlerWithContext, PageHandlerWithoutContext } from './page-factory';
import { createRoutes, type Routes, type RoutesConfig, type RouteDefinition, type ExtractRoutesContext } from './factory';

/**
 * Options for creating page contract
 */
export interface CreatePageContractOptions<TRootContext> {
  /**
   * Function to get root context from PageInput
   * This context will be automatically available in all page functions
   */
  appContext: (input: PageInput) => TRootContext | Promise<TRootContext>;
}

/**
 * Page contract instance with bound app context
 */
export interface PageContract<TRootContext> {
  /**
   * Create a page function with automatic app context injection
   * 
   * @example
   * ```ts
   * const HomePage = contract.definePage<Record<string, never>, HomeRouteContext>({
   *   handler: async ({ params, rootContext }) => {
   *     // rootContext is automatically available
   *     return { type: 'ok', ctx: { ... } };
   *   }
   * });
   * ```
   */
  definePage<TParams = any, TCtx = any>(
    options: {
      handler: PageHandlerWithContext<TRootContext, TParams, TCtx>;
    }
  ): PageFunction<TParams, TCtx>;

  /**
   * Create a page function without app context (for simple pages)
   * 
   * @example
   * ```ts
   * const ProductPage = contract.definePageWithoutContext<{ slug: string }, ProductRouteContext>({
   *   handler: async ({ params }) => {
   *     return { type: 'ok', ctx: { ... } };
   *   }
   * });
   * ```
   */
  definePageWithoutContext<TParams = any, TCtx = any>(
    options: {
      handler: PageHandlerWithoutContext<TParams, TCtx>;
    }
  ): PageFunction<TParams, TCtx>;

  /**
   * Create routes with automatic app context injection
   * 
   * @example
   * ```ts
   * const routes = contract.createRoutes({
   *   routes: {
   *     home: { path: '/', page: HomePage },
   *     profile: { path: '/profile/:id', page: ProfilePage }
   *   }
   * });
   * ```
   */
  createRoutes<TRoutesConfig extends RoutesConfig<TRootContext>>(options: {
    routes: TRoutesConfig;
  }): Routes<TRootContext, TRoutesConfig>;
}

/**
 * Main factory for creating page contract instance
 * 
 * This is the entry point for applications. Call this once with your app context,
 * and all subsequent operations will automatically use it.
 * 
 * @example
 * ```ts
 * const contract = createPageContract<AppRootContext>({
 *   appContext: getRootContextFromInput
 * });
 * 
 * const HomePage = contract.definePage<Record<string, never>, HomeRouteContext>({
 *   handler: async ({ rootContext }) => {
 *     return { type: 'ok', ctx: { ... } };
 *   }
 * });
 * 
 * const routes = contract.createRoutes({
 *   routes: {
 *     home: { path: '/', page: HomePage }
 *   }
 * });
 * ```
 */
export function createPageContract<TRootContext>(
  options: CreatePageContractOptions<TRootContext>
): PageContract<TRootContext> {
  const { appContext } = options;

  /**
   * Define page with automatic app context
   */
  function definePage<TParams = any, TCtx = any>(
    options: {
      handler: PageHandlerWithContext<TRootContext, TParams, TCtx>;
    }
  ): PageFunction<TParams, TCtx> {
    return async (input: PageInput<TParams>): Promise<PageResult<TCtx>> => {
      const rootContext = await appContext(input);
      return options.handler({
        params: input.params,
        rootContext,
        input,
      });
    };
  }

  /**
   * Define page without app context
   */
  function definePageWithoutContext<TParams = any, TCtx = any>(
    options: {
      handler: PageHandlerWithoutContext<TParams, TCtx>;
    }
  ): PageFunction<TParams, TCtx> {
    return async (input: PageInput<TParams>): Promise<PageResult<TCtx>> => {
      return options.handler({
        params: input.params,
        input,
      });
    };
  }

  /**
   * Create routes with automatic app context
   */
  function createRoutesWithContext<TRoutesConfig extends RoutesConfig<TRootContext>>(options: {
    routes: TRoutesConfig;
  }): Routes<TRootContext, TRoutesConfig> {
    return createRoutes<TRootContext, TRoutesConfig>({
      appContext,
      routes: options.routes,
    });
  }

  return {
    definePage,
    definePageWithoutContext,
    createRoutes: createRoutesWithContext,
  };
}

