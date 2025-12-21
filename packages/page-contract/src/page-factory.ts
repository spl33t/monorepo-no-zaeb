/**
 * Type-safe factory for creating PageFunctions
 */

import type { PageFunction, PageInput, PageResult, PageViewInput, PageResultType } from './types';

/**
 * Generic component type (для React, Vue, и т.д.)
 */
type ComponentType<P = any> = (props: P) => any;

/**
 * React element type
 */
type ReactElement = any;

/**
 * View components map for different result types
 * "*" - default component (fallback)
 * Other keys correspond to specific result types
 */
export type PageViewComponents<
  TParams = any,
  TCtx = any,
  TRootContext = any,
  TWithoutAppContext = false,
  TResultTypes extends PageResultType = PageResultType
> = {
  /**
   * Default component (fallback for any result type)
   */
  '*': TWithoutAppContext extends true
    ? (routeContext: TCtx | null, input: PageViewInput<TParams, TResultTypes>) => ReactElement
    : (routeContext: TCtx | null, appContext: TRootContext | null, input: PageViewInput<TParams, TResultTypes>) => ReactElement;
} & Partial<{
  /**
   * Component for 'ok' result type
   */
  'ok': TWithoutAppContext extends true
    ? (routeContext: TCtx | null, input: PageViewInput<TParams, TResultTypes>) => ReactElement
    : (routeContext: TCtx | null, appContext: TRootContext | null, input: PageViewInput<TParams, TResultTypes>) => ReactElement;
  /**
   * Component for 'not-found' result type
   */
  'not-found': TWithoutAppContext extends true
    ? (routeContext: TCtx | null, input: PageViewInput<TParams, TResultTypes>) => ReactElement
    : (routeContext: TCtx | null, appContext: TRootContext | null, input: PageViewInput<TParams, TResultTypes>) => ReactElement;
  /**
   * Component for 'error' result type
   */
  'error': TWithoutAppContext extends true
    ? (routeContext: TCtx | null, input: PageViewInput<TParams, TResultTypes>) => ReactElement
    : (routeContext: TCtx | null, appContext: TRootContext | null, input: PageViewInput<TParams, TResultTypes>) => ReactElement;
  /**
   * Component for 'redirect' result type
   */
  'redirect': TWithoutAppContext extends true
    ? (routeContext: TCtx | null, input: PageViewInput<TParams, TResultTypes>) => ReactElement
    : (routeContext: TCtx | null, appContext: TRootContext | null, input: PageViewInput<TParams, TResultTypes>) => ReactElement;
}>;

/**
 * Page contract with handler and view factory
 * TParams - тип параметров URL (извлекается из path)
 * TCtx - тип контекста страницы
 * TRootContext - тип root контекста приложения
 * TWithoutAppContext - если true, то appContext недоступен в createView
 * TResultTypes - Union типов результатов, которые может вернуть handler (сужает resultType)
 */
export interface PageContract<TParams = any, TCtx = any, TRootContext = any, TWithoutAppContext = false, TResultTypes extends PageResultType = PageResultType> {
  /**
   * Page function for execution
   */
  handler: PageFunction<TParams, TCtx>;
  
  /**
   * Create view component for this page
   * Type-safe фабрика для создания компонента страницы
   * 
   * Принимает объект с компонентами для разных типов результатов:
   * - "*" - обязательный дефолтный компонент (fallback)
   * - "ok", "not-found", "error", "redirect" - опциональные компоненты для конкретных типов
   * 
   * PageInput типизирован на основе TParams страницы
   * resultType сужается на основе TResultTypes
   * 
   * Если TWithoutAppContext = true, то компоненты принимают только routeContext и pageInput
   * Если TWithoutAppContext = false, то компоненты принимают routeContext, appContext и pageInput
   * 
   * @example
   * ```tsx
   * // С appContext
   * export default ProfilePage.createView({
   *   "*": (routeContext, appContext, pageInput) => {
   *     return <div>{routeContext?.message || 'Default'}</div>;
   *   },
   *   "not-found": (routeContext, appContext, pageInput) => {
   *     return <div>404 - Profile Not Found</div>;
   *   },
   * });
   * 
   * // Без appContext
   * export default ProductPage.createView({
   *   "*": (routeContext, pageInput) => {
   *     return <div>{routeContext?.product?.name || 'Loading...'}</div>;
   *   },
   *   "not-found": (routeContext, pageInput) => {
   *     return <div>404 - Product Not Found</div>;
   *   },
   * });
   * ```
   */
  createView(
    components: PageViewComponents<TParams, TCtx, TRootContext, TWithoutAppContext, TResultTypes>
  ): ComponentType;
}

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
 * Extract TParams from handler function
 */
export type ExtractParamsFromHandler<THandler> = 
  THandler extends (args: { params: infer TParams; rootContext: any; input: any }) => any
    ? TParams
    : THandler extends (args: { params: infer TParams; input: any }) => any
      ? TParams
      : any;

/**
 * Extract TCtx from handler function return type
 */
export type ExtractCtxFromHandler<THandler> = 
  THandler extends (...args: any[]) => infer R
    ? Awaited<R> extends PageResult<infer TCtx>
      ? TCtx
      : any
    : any;

/**
 * Extract possible result types from handler function
 * Returns union of all possible 'type' values that handler can return
 * 
 * @example
 * // If handler returns only 'ok' | 'not-found', this will be 'ok' | 'not-found'
 * type ResultTypes = ExtractResultTypesFromHandler<typeof myHandler>;
 */
export type ExtractResultTypesFromHandler<THandler> = 
  THandler extends (...args: any[]) => infer R
    ? Awaited<R> extends PageResult<any>
      ? Awaited<R>['type']
      : PageResultType
    : PageResultType;

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
 * 
 * // Использование
 * const HomeComponent = HomePage.createView(Home);
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
): PageContract<TCtx>;

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
 * 
 * // Использование
 * const ProductComponent = ProductPage.createView(Product);
 * ```
 */
export function definePage<TParams = any, TCtx = any>(
  options: {
    handler: PageHandlerWithoutContext<TParams, TCtx>;
  }
): PageContract<TParams, TCtx, any, true>;

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
): PageContract<TParams, TCtx, TRootContext, any> {
  // Create page function
  const pageFunction: PageFunction<TParams, TCtx> = async (input: PageInput<TParams>): Promise<PageResult<TCtx>> => {
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
  
  // Create view factory
  // Note: This is a placeholder - actual implementation should be in contract-factory
  // where we have access to TRootContext
  const createView = (components: PageViewComponents<TParams, TCtx, TRootContext, any, any>): ComponentType => {
    // This will be overridden in contract-factory
    return () => null;
  };
  
  return {
    handler: pageFunction,
    createView,
  };
}

