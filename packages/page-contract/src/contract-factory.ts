/**
 * Main factory for initializing page-contract with app context
 * This is the entry point for applications using the library
 */

import type { PageInput, PageFunction, PageResult, PageViewInput, PageResultType } from './types';
import type { 
  PageHandlerWithContext, 
  PageHandlerWithoutContext, 
  PageContract as PageContractType,
  ExtractParamsFromHandler,
  ExtractCtxFromHandler,
  ExtractResultTypesFromHandler
} from './page-factory';
import { createRoutes, type Routes, type RoutesConfig, type RouteDefinition, type ExtractRoutesContext } from './factory';

/**
 * Generic component type (для React, Vue, и т.д.)
 */
type ComponentType<P = any> = (props: P) => any;

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
 * Page contract factory instance with bound app context (main factory)
 */
export interface PageContractFactory<TRootContext> {
  /**
   * Create a page function with or without app context
   * 
   * @example
   * ```ts
   * // With app context (default)
   * const HomePage = contract.definePage<Record<string, never>, HomeRouteContext>({
   *   handler: async ({ params, rootContext }) => {
   *     // rootContext is automatically available
   *     return { type: 'ok', ctx: { ... } };
   *   }
   * });
   * 
   * // Without app context
   * const ProductPage = contract.definePage<{ slug: string }, ProductRouteContext>({
   *   withoutAppContext: true,
   *   handler: async ({ params }) => {
   *     return { type: 'ok', ctx: { ... } };
   *   }
   * });
   * 
   * // Использование
   * const HomeComponent = HomePage.createView(Home);
   * const ProductComponent = ProductPage.createView(Product);
   * ```
   */
  // Overload for pages without app context - with explicit types
  definePage<TParams = any, TCtx = any>(
    options: {
      withoutAppContext: true;
      handler: PageHandlerWithoutContext<TParams, TCtx>;
    }
  ): PageContractType<TParams, TCtx, TRootContext, true, PageResultType>;
  
  // Overload for pages without app context - infer types from handler
  definePage<THandler extends PageHandlerWithoutContext<any, any>>(
    options: {
      withoutAppContext: true;
      handler: THandler;
    }
  ): PageContractType<
    ExtractParamsFromHandler<THandler>, 
    ExtractCtxFromHandler<THandler>, 
    TRootContext, 
    true,
    ExtractResultTypesFromHandler<THandler>
  >;
  
  // Overload for pages with app context - with explicit types
  definePage<TParams = any, TCtx = any>(
    options: {
      withoutAppContext?: false;
      handler: PageHandlerWithContext<TRootContext, TParams, TCtx>;
    }
  ): PageContractType<TParams, TCtx, TRootContext, false, PageResultType>;
  
  // Overload for pages with app context - infer types from handler
  definePage<THandler extends PageHandlerWithContext<TRootContext, any, any>>(
    options: {
      withoutAppContext?: false;
      handler: THandler;
    }
  ): PageContractType<
    ExtractParamsFromHandler<THandler>, 
    ExtractCtxFromHandler<THandler>, 
    TRootContext, 
    false,
    ExtractResultTypesFromHandler<THandler>
  >;

  /**
   * Create routes with automatic app context injection
   * 
   * @example
   * ```ts
   * const routes = contract.createRoutes({
   *   routes: {
   *     home: { path: '/', page: HomePage },
   *     profile: { path: '/profile/:id', page: ProfilePage }
   *   },
   *   notFoundPath: '/404'
   * });
   * ```
   */
  createRoutes<TRoutesConfig extends RoutesConfig<TRootContext>>(options: {
    routes: TRoutesConfig;
    notFoundPath?: string;
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
): PageContractFactory<TRootContext> {
  const { appContext } = options;

  /**
   * Define page with or without app context
   * Types are inferred from handler if not explicitly provided
   */
  function definePage(
    options:
      | {
          withoutAppContext: true;
          handler: PageHandlerWithoutContext<any, any>;
        }
      | {
          withoutAppContext?: false;
          handler: PageHandlerWithContext<TRootContext, any, any>;
        }
  ): PageContractType<any, any, TRootContext, any> {
    const isWithoutAppContext = options.withoutAppContext === true;
    
    // Extract types from handler
    type HandlerParams = ExtractParamsFromHandler<typeof options.handler>;
    type HandlerCtx = ExtractCtxFromHandler<typeof options.handler>;
    type HandlerResultTypes = ExtractResultTypesFromHandler<typeof options.handler>;
    
    const pageFunction: PageFunction<HandlerParams, HandlerCtx> = async (input: PageInput<HandlerParams>): Promise<PageResult<HandlerCtx>> => {
      if (isWithoutAppContext) {
        // Page without app context
        return (options as any).handler({
          params: input.params,
          input,
        });
      } else {
        // Page with app context
        const rootContext = await appContext(input);
        return (options as any).handler({
          params: input.params,
          rootContext,
          input,
        });
      }
    };
    
    const createView = (components: any): ComponentType => {
      // Return a React component that uses hooks to get context and calls the appropriate component
      // The hooks will be provided by the application's RouteContext
      return function PageViewComponent() {
        const hooks = (globalThis as any).__PAGE_CONTRACT_HOOKS__;
        if (!hooks) {
          throw new Error('Page contract hooks not initialized. Make sure RouteContextProvider is set up.');
        }
        
        const routeContext = hooks.useRouteContext() as HandlerCtx | null;
        const pageInput = (hooks.usePageInput as () => PageViewInput<HandlerParams, HandlerResultTypes> | null)() as PageViewInput<HandlerParams, HandlerResultTypes> | null;
        
        // Если pageInput отсутствует, создаем дефолтный с resultType: 'ok'
        // Приводим к HandlerResultTypes, так как 'ok' всегда входит в возможные типы
        const pageViewInput: PageViewInput<HandlerParams, HandlerResultTypes> = pageInput || {
          params: {} as HandlerParams,
          query: {},
          resultType: 'ok' as HandlerResultTypes,
        };
        
        // Выбираем компонент на основе resultType
        // Сначала проверяем наличие специфичного компонента для типа результата
        // Если нет, используем дефолтный "*"
        const resultType = pageViewInput.resultType;
        const component = components[resultType] || components['*'];
        
        if (!component) {
          throw new Error(`No component found for resultType "${resultType}" and no default "*" component provided.`);
        }
        
        if (isWithoutAppContext) {
          // For pages without app context, pass routeContext and pageInput
          return component(routeContext, pageViewInput);
        } else {
          // For pages with app context, pass routeContext, appContext and pageInput
          const appContextValue = hooks.useAppContext() as TRootContext | null;
          return component(routeContext, appContextValue, pageViewInput);
        }
      } as any;
    };
    
    return {
      handler: pageFunction,
      createView,
    } as any;
  }

  /**
   * Create routes with automatic app context
   */
  function createRoutesWithContext<TRoutesConfig extends RoutesConfig<TRootContext>>(options: {
    routes: TRoutesConfig;
    notFoundPath?: string;
  }): Routes<TRootContext, TRoutesConfig> {
    return createRoutes<TRootContext, TRoutesConfig>({
      appContext,
      routes: options.routes,
      ...(options.notFoundPath !== undefined && { notFoundPath: options.notFoundPath }),
    });
  }

  return {
    definePage,
    createRoutes: createRoutesWithContext,
  };
}

