// =======================
// Минимальный runtime-контекст (для формирования AppContext сервером)
export interface RuntimeContext {
  url: string;
}

// Результаты PageFunction
// data доступно только если RouteCtx явно указан (не unknown по умолчанию)
// Используем проверку: [RouteCtx] extends [unknown] проверяет точное равенство типов
// Если RouteCtx = unknown, то [unknown] extends [RouteCtx] тоже true, что означает что это точно unknown
type PageResultOk<RouteCtx> = [RouteCtx] extends [unknown]
  ? [unknown] extends [RouteCtx]
    ? { type: 'ok'; seo?: unknown }
    : { type: 'ok'; data?: RouteCtx; seo?: unknown }
  : { type: 'ok'; data?: RouteCtx; seo?: unknown };

type PageResultNotFound<RouteCtx> = [RouteCtx] extends [unknown]
  ? [unknown] extends [RouteCtx]
    ? { type: 'not-found' }
    : { type: 'not-found'; data?: RouteCtx }
  : { type: 'not-found'; data?: RouteCtx };

export type PageResult<RouteCtx = unknown> =
  | PageResultOk<RouteCtx>
  | { type: 'redirect'; to: string; status?: number }
  | PageResultNotFound<RouteCtx>;

// =======================
// Type-safe params из path
type ParamsFromPath<Path extends string> =
  Path extends `${infer _Start}/:${infer Param}/${infer Rest}`
    ? { [k in Param | keyof ParamsFromPath<`/${Rest}`>]: string }
    : Path extends `${infer _Start}/:${infer Param}`
    ? { [k in Param]: string }
    : {};

// =======================
// PageFunction с условием: AppCtx только если есть AppContext
export type PageFunction<
  AppCtx,
  Params = Record<string, string>,
  RouteCtx = unknown,
  HasAppCtx extends boolean = true
> = HasAppCtx extends true
  ? (args: { appContext: AppCtx; params: Params }) => PageResult<RouteCtx> | Promise<PageResult<RouteCtx>>
  : (args: { params: Params }) => PageResult<RouteCtx> | Promise<PageResult<RouteCtx>>;

// Извлечение типа RouteCtx из PageFunction
// Этот тип извлекает RouteCtx из возвращаемого значения PageFunction
export type ExtractRouteCtx<T> = T extends (...args: any[]) => infer R
  ? Awaited<R> extends PageResult<infer RouteCtx>
    ? RouteCtx
    : unknown
  : unknown;

// Удаление свойств с типом never из объекта (включая опциональные свойства)
// Проверяем как полные never свойства, так и опциональные (never | undefined)
type OmitNever<T> = {
  [K in keyof T as 
    T[K] extends never 
      ? never 
      : [Exclude<T[K], undefined>] extends [never] 
        ? never 
        : K]: T[K];
};

// Нормализация типа результата - убирает data из вариантов, где оно не указано явно
// И удаляет свойства с типом never
type NormalizePageResult<T> = T extends { type: 'ok'; data: infer D }
  ? { type: 'ok'; data: OmitNever<D>; seo?: unknown }
  : T extends { type: 'ok' }
  ? { type: 'ok'; seo?: unknown }
  : T extends { type: 'not-found'; data: infer D }
  ? { type: 'not-found'; data: OmitNever<D> }
  : T extends { type: 'not-found' }
  ? { type: 'not-found' }
  : T;

// Извлечение точного типа результата из PageFunction
// Возвращает union всех возможных результатов функции, нормализованных (data только если указано, never свойства исключены)
export type ExtractPageResult<TPageFunction> = TPageFunction extends (...args: any[]) => infer R
  ? Awaited<R> extends infer Result
    ? Result extends any
      ? NormalizePageResult<Result>
      : never
    : never
  : never;

// React компонент (общий тип)
type ReactComponent<P = any> = (props: P) => any;

// Тип пропсов для компонента страницы
export type PageViewProps<
  AppCtx,
  TPageContext,
  Params,
  HasAppCtx extends boolean
> = HasAppCtx extends true
  ? { appContext: AppCtx; pageContext: TPageContext; params: Params }
  : { pageContext: TPageContext; params: Params };

// PageDefinition
export interface PageDefinition<
  AppCtx,
  Path extends string = string,
  RouteCtx = unknown,
  HasAppCtx extends boolean = true
> {
  path: Path;
  page: PageFunction<AppCtx, ParamsFromPath<Path>, RouteCtx, HasAppCtx>;
}

// Результат definePage - объект с функцией defineView
export interface PageWithView<
  AppCtx,
  Path extends string,
  RouteCtx,
  HasAppCtx extends boolean,
  TPageFunction extends PageFunction<AppCtx, ParamsFromPath<Path>, RouteCtx, HasAppCtx> = PageFunction<AppCtx, ParamsFromPath<Path>, RouteCtx, HasAppCtx>
> {
  path: Path;
  page: TPageFunction;
  defineView: <TComponent extends ReactComponent<PageViewProps<AppCtx, ExtractPageResult<TPageFunction>, ParamsFromPath<Path>, HasAppCtx>>>(
    component: TComponent
  ) => ReactComponent<PageViewProps<AppCtx, ExtractPageResult<TPageFunction>, ParamsFromPath<Path>, HasAppCtx>>;
}

// =======================
// Contract API
export type Contract<AppCtx, HasAppCtx extends boolean = false> = {
  // Перегрузка для извлечения типа из конкретной функции page
  definePage<Path extends string, TPageFunction extends PageFunction<AppCtx, ParamsFromPath<Path>, any, HasAppCtx>>(
    page: {
      path: Path;
      page: TPageFunction;
    }
  ): PageWithView<AppCtx, Path, ExtractRouteCtx<TPageFunction>, HasAppCtx, TPageFunction>;
  
  // Перегрузка с явным указанием RouteCtx
  definePage<Path extends string, RouteCtx = unknown>(
    page: PageDefinition<AppCtx, Path, RouteCtx, HasAppCtx>
  ): PageWithView<AppCtx, Path, RouteCtx, HasAppCtx, PageDefinition<AppCtx, Path, RouteCtx, HasAppCtx>['page']>;

  createRoutes(): PageDefinition<AppCtx, any, any, HasAppCtx>[];

  matchRoute(url: string): {
    page: PageDefinition<AppCtx, any, any, HasAppCtx> | null;
    params: Record<string, string>;
  };
} & (HasAppCtx extends true
  ? { getAppContext: (ctx: RuntimeContext) => AppCtx | Promise<AppCtx> }
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
  config: { appContext: (ctx: RuntimeContext) => AppCtx | Promise<AppCtx> }
): Contract<AppCtx, true>;

export function initContract<AppCtx>(
  config?: { appContext?: (ctx: RuntimeContext) => AppCtx | Promise<AppCtx> }
): Contract<AppCtx, false>;

// =======================
// Реализация initContract
export function initContract<AppCtx>(
  config?: { appContext?: (ctx: RuntimeContext) => AppCtx | Promise<AppCtx> }
) {
  const pages: PageDefinition<AppCtx, any, any, any>[] = [];

  function definePage<Path extends string, TPageFunction = any>(
    page: {
      path: Path;
      page: TPageFunction;
    }
  ): any {
    // Создаем объект страницы с полем component, которое будет заполнено через defineView
    const pageDefinition: any = {
      path: page.path,
      page: page.page,
      component: undefined,
    };
    pages.push(pageDefinition);
    
    const defineView = (component: any) => {
      // Сохраняем компонент в объект страницы
      pageDefinition.component = component;
      return component;
    };

    return {
      path: page.path,
      page: page.page,
      defineView,
    };
  }

  function createRoutes() {
    return pages;
  }

  function matchRoute(url: string) {
    for (const page of pages) {
      const params = matchPath(page.path, url);
      if (params) {
        return { page, params, component: (page as any).component };
      }
    }
    return { page: null, params: {}, component: undefined };
  }

  const contract: any = {
    definePage,
    createRoutes,
    matchRoute,
  };

  if (config?.appContext) {
    contract.getAppContext = config.appContext;
  }

  return contract;
}

// =======================
// SPA Enhancement
export { enhanceContractWithSPA, navigateTo } from './spa';

