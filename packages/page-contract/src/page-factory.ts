/**
 * Type-safe factory for creating PageFunctions
 */

import type { PageFunction, PageInput, PageResult } from './types';

/**
 * Handler function for page with root context
 */
export type PageHandlerWithContext<
  TRootContext,
  TParams = any,
  TCtx = any
> = (args: {
  params: TParams;
  rootContext: TRootContext;
  input: PageInput<TParams>;
}) => Promise<PageResult<TCtx>> | PageResult<TCtx>;

/**
 * Handler function for page without root context
 */
export type PageHandlerWithoutContext<TParams = any, TCtx = any> = (args: {
  params: TParams;
  input: PageInput<TParams>;
}) => Promise<PageResult<TCtx>> | PageResult<TCtx>;

/**
 * Options for definePage with context
 */
export interface DefinePageWithContextOptions<TRootContext> {
  /**
   * Function to get root context from PageInput
   */
  appContext: (input: PageInput) => TRootContext | Promise<TRootContext>;
  
  /**
   * Page handler function
   */
  handler: PageHandlerWithContext<TRootContext, any, any>;
}

/**
 * Type-safe factory for creating PageFunction with root context
 * 
 * @example
 * ```ts
 * const HomePage = definePage<AppRootContext, Record<string, never>, HomeRouteContext>({
 *   appContext: getRootContextFromInput,
 *   handler: async ({ params, rootContext, input }) => {
 *     return {
 *       type: 'ok',
 *       ctx: { message: `Welcome! Locale: ${rootContext.locale}` },
 *       seo: { title: 'Home' }
 *     };
 *   }
 * });
 * ```
 */
export function definePage<
  TRootContext,
  TParams = any,
  TCtx = any
>(
  options: DefinePageWithContextOptions<TRootContext> & {
    handler: PageHandlerWithContext<TRootContext, TParams, TCtx>;
  }
): PageFunction<TParams, TCtx>;

/**
 * Type-safe factory for creating PageFunction without root context
 * 
 * @example
 * ```ts
 * const ProductPage = definePage<{ slug: string }, ProductRouteContext>({
 *   handler: async ({ params, input }) => {
 *     return {
 *       type: 'ok',
 *       ctx: { product: { ... } },
 *       seo: { title: 'Product' }
 *     };
 *   }
 * });
 * ```
 */
export function definePage<TParams = any, TCtx = any>(
  options: {
    handler: PageHandlerWithoutContext<TParams, TCtx>;
  }
): PageFunction<TParams, TCtx>;

/**
 * Implementation
 */
export function definePage<TRootContext = any, TParams = any, TCtx = any>(
  options:
    | (DefinePageWithContextOptions<TRootContext> & {
        handler: PageHandlerWithContext<TRootContext, TParams, TCtx>;
      })
    | {
        handler: PageHandlerWithoutContext<TParams, TCtx>;
      }
): PageFunction<TParams, TCtx> {
  return async (input: PageInput<TParams>): Promise<PageResult<TCtx>> => {
    // Check if appContext is provided (page with context)
    if ('appContext' in options) {
      const rootContext = await options.appContext(input);
      return options.handler({
        params: input.params,
        rootContext,
        input,
      });
    } else {
      // Page without context
      return options.handler({
        params: input.params,
        input,
      });
    }
  };
}

