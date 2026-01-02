// =======================
// Request объект с информацией о HTTP запросе
export interface RequestContext {
  method: string;
  url: string;
  headers: Record<string, string | string[]>;
  query: Record<string, string | string[]>;
  cookies?: Record<string, string>;
  userAgent?: string;
  ip?: string;
  host?: string;
  protocol?: string;
}


// Результаты PageFunction
type PageResult<RouteCtx = unknown> =
  | { type: 'ok'; data?: RouteCtx; seo?: unknown }
  | { type: 'redirect'; to: string; status?: number }
  | { type: 'not-found'; data?: RouteCtx };

// =======================
// Type-safe params из path
import type { ParamsFromUrl } from './path';

// Используем ParamsFromUrl из path.ts для правильного извлечения параметров
type ParamsFromPath<Path extends string> = ParamsFromUrl<Path>;

// =======================
// PageFunction с автоматическим определением аргументов
export type PageFunction<
  AppCtx,
  Params = Record<string, string>,
  RouteCtx = unknown,
  HasAppCtx extends boolean = true
> = HasAppCtx extends true
  ? [keyof Params] extends [never]
    ? (args: { appContext: AppCtx; req: RequestContext }) => PageResult<RouteCtx> | Promise<PageResult<RouteCtx>>
    : (args: { appContext: AppCtx; params: Params; req: RequestContext }) => PageResult<RouteCtx> | Promise<PageResult<RouteCtx>>
  : [keyof Params] extends [never]
    ? (args: { req: RequestContext }) => PageResult<RouteCtx> | Promise<PageResult<RouteCtx>>
    : (args: { params: Params; req: RequestContext }) => PageResult<RouteCtx> | Promise<PageResult<RouteCtx>>;

// Извлечение типа RouteCtx из PageFunction
export type ExtractRouteCtx<T> = T extends (...args: any[]) => infer R
  ? Awaited<R> extends { type: 'ok'; data: infer D }
    ? D
    : unknown
  : unknown;


// PageDefinition
export interface PageDefinition<
  AppCtx,
  Path extends string = string,
  RouteCtx = unknown,
  HasAppCtx extends boolean = true
> {
  path: Path;
  fn: PageFunction<AppCtx, ParamsFromPath<Path>, RouteCtx, HasAppCtx>;
}



// =======================
// Contract API
export type Contract<AppCtx, HasAppCtx extends boolean = false> = {
  createRoute<
    Path extends string
  >(
    path: Path,
    fn: PageFunction<AppCtx, ParamsFromPath<Path>, any, HasAppCtx>
  ): PageDefinition<AppCtx, Path, any, HasAppCtx>;

  createRoutes<
    Routes extends Record<string, PageDefinition<AppCtx, any, any, any> | { path: string; fn: any }>
  >(
    routes: Routes
  ): Record<string, PageDefinition<AppCtx, any, any, any>>;

  getRoutes(): PageDefinition<AppCtx, any, any, HasAppCtx>[];

  matchRoute(url: string): {
    page: PageDefinition<AppCtx, any, any, HasAppCtx> | null;
    params: Record<string, string>;
  };
} & (HasAppCtx extends true
  ? { getAppContext: (ctx: RequestContext) => AppCtx | Promise<AppCtx> }
  : {});

// =======================
// Вспомогательная функция для сопоставления пути и извлечения params
function matchPath(pathPattern: string, url: string): Record<string, string> | null {
  const pathSegments = pathPattern.split('/').filter(Boolean);
  const urlSegments = url.split('/').filter(Boolean);

  if (pathSegments.length !== urlSegments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < pathSegments.length; i++) {
    const ps = pathSegments[i];
    const us = urlSegments[i];

    if (ps.startsWith(':')) {
      const key = ps.slice(1);
      params[key] = decodeURIComponent(us);
    } else if (ps !== us) {
      return null;
    }
  }

  return params;
}

// =======================
// Перегрузки initContract
export function initContract<AppCtx>(
  config: { appContext: (ctx: RequestContext) => AppCtx | Promise<AppCtx> }
): Contract<AppCtx, true>;

export function initContract<AppCtx>(
  config?: { appContext?: (ctx: RequestContext) => AppCtx | Promise<AppCtx> }
): Contract<AppCtx, false>;

// =======================
// Реализация initContract
export function initContract<AppCtx>(
  config?: { appContext?: (ctx: RequestContext) => AppCtx | Promise<AppCtx> }
) {
  const pages: PageDefinition<AppCtx, any, any, any>[] = [];

  function createRoute<
    Path extends string
  >(
    path: Path,
    fn: PageFunction<AppCtx, ParamsFromPath<Path>, any, any>
  ): PageDefinition<AppCtx, Path, any, any> {
    const pageDefinition: PageDefinition<AppCtx, Path, any, any> = {
      path,
      fn: fn as any,
    };
    pages.push(pageDefinition);
    return pageDefinition;
  }

  function createRoutes<
    Routes extends Record<string, PageDefinition<AppCtx, any, any, any> | { path: string; fn: any }>
  >(
    routes: Routes
  ): Record<string, PageDefinition<AppCtx, any, any, any>> {
    const result: any = {};

    for (const [key, route] of Object.entries(routes)) {
      const r = route as any;
      let pageDefinition: PageDefinition<AppCtx, any, any, any>;

      // Определяем fn и path в зависимости от формата объекта
      const fn = r.fn || r.page;
      const path = r.path;

      pageDefinition = { path, fn };
      pages.push(pageDefinition);
      result[key] = pageDefinition;
    }

    return result;
  }

  function getRoutes() {
    return pages;
  }

  function matchRoute(url: string) {
    for (const page of pages) {
      const params = matchPath(page.path, url);
      if (params) {
        return { page, params };
      }
    }
    return { page: null, params: {} };
  }

  const contract: any = {
    createRoute,
    createRoutes,
    getRoutes,
    matchRoute,
  };

  if (config?.appContext) {
    contract.getAppContext = config.appContext;
  }

  return contract;
}

// =======================
// SPA Enhancement
export { updateTitleOnNavigation } from './spa';

// =======================
// SEO Gateway
export { createSeoServer } from './seo-gateway';

