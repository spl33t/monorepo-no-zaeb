import type { QueryClient, QueryKey } from "@tanstack/query-core";
import type { ApiCoreBase } from "./core";
import type { FlattenRoutes, IsEmptyRequest, RouteRequest } from "./types";
import { buildArgsFromRequest, buildRouteIndex } from "./utils";

/**
 * Route-строковый слой ("МЕТОД /путь" вместо явной функции из SDK), вроде
 * над createApiCoreBase — ключевание по функции остаётся доступно напрямую
 * через `base`, эта фабрика не заменяет его, а добавляет альтернативный
 * способ адресации того же самого. Один вызов createRouteCore(sdk, base) —
 * один сгенерированный Nestia-клиент (entry point); мерджа между несколькими
 * sdk в одном вызове нет — осознанно, чтобы не разбираться с коллизиями
 * "МЕТОД /путь" между разными клиентами.
 */
export function createRouteCore<TSdk extends object>(sdk: TSdk, base: ApiCoreBase) {
  type Routes = FlattenRoutes<TSdk>;
  type RouteKey = keyof Routes & string;

  // Метод достаём из самой строки ключа ("GET /users" -> "GET"), а не из
  // Routes[K]['METADATA'] — короче и не нужно лезть в структуру функции.
  type MethodOf<K extends string> = K extends `${infer M} ${string}` ? M : never;
  type QueryRouteKey = { [K in RouteKey]: MethodOf<K> extends "GET" ? K : never }[RouteKey];
  type MutationRouteKey = Exclude<RouteKey, QueryRouteKey>;

  const routeIndex = buildRouteIndex(sdk);

  function resolve<K extends RouteKey>(key: K): Routes[K] {
    const fn = routeIndex[key];
    if (!fn) throw new Error(`[createApiCore] неизвестный route: "${key}"`);
    return fn as Routes[K];
  }

  type ResolvedFn = Function & { METADATA: { path: string; request: unknown } };

  function routeQueryKey<K extends QueryRouteKey>(
    key: K,
    ...rest: IsEmptyRequest<RouteRequest<Routes, K>> extends true
      ? [request?: RouteRequest<Routes, K>]
      : [request: RouteRequest<Routes, K>]
  ): QueryKey {
    const fn = resolve(key) as unknown as ResolvedFn;
    const args = buildArgsFromRequest(fn, (rest[0] as Record<string, unknown>) ?? {});
    return base.getEndpointQueryKey(fn as any, args as any);
  }

  function invalidateRoute<K extends QueryRouteKey>(
    queryClient: QueryClient,
    key: K,
    ...rest: IsEmptyRequest<RouteRequest<Routes, K>> extends true
      ? [request?: RouteRequest<Routes, K>]
      : [request: RouteRequest<Routes, K>]
  ) {
    const fn = resolve(key) as unknown as ResolvedFn;
    const args = buildArgsFromRequest(fn, (rest[0] as Record<string, unknown>) ?? {});
    return base.invalidateEndpoint(queryClient, fn as any, args as any);
  }

  function resetRoute<K extends QueryRouteKey>(
    queryClient: QueryClient,
    key: K,
    ...rest: IsEmptyRequest<RouteRequest<Routes, K>> extends true
      ? [request?: RouteRequest<Routes, K>]
      : [request: RouteRequest<Routes, K>]
  ) {
    const fn = resolve(key) as unknown as ResolvedFn;
    const args = buildArgsFromRequest(fn, (rest[0] as Record<string, unknown>) ?? {});
    return base.resetEndpoint(queryClient, fn as any, args as any);
  }

  function prefetchRoute<K extends QueryRouteKey>(
    queryClient: QueryClient,
    key: K,
    ...rest: IsEmptyRequest<RouteRequest<Routes, K>> extends true
      ? [request?: RouteRequest<Routes, K>]
      : [request: RouteRequest<Routes, K>]
  ) {
    const fn = resolve(key) as unknown as ResolvedFn;
    const args = buildArgsFromRequest(fn, (rest[0] as Record<string, unknown>) ?? {});
    return base.prefetchEndpoint(queryClient, fn as any, args as any);
  }

  return {
    resolve,
    queryKey: routeQueryKey,
    invalidate: invalidateRoute,
    reset: resetRoute,
    prefetch: prefetchRoute,
  };
}

export type RouteCore<TSdk extends object> = ReturnType<typeof createRouteCore<TSdk>>;
