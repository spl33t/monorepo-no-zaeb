import type { IConnection } from "@nestia/fetcher";
import type { InfiniteData, QueryFunctionContext, QueryKey } from "@tanstack/query-core";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { ApiCoreBase, ApiCoreConfig } from "./core/core";
import { createApiCore } from "./core/core";
import type { ApiError } from "./core/errors";
import type { RouteCore } from "./core/routes";
import type {
  ConnectionHeaders,
  FlattenRoutes,
  IsEmptyRequest,
  NestiaEndpoint,
  RouteOutput,
  RouteRequest,
} from "./core/types";
import { buildArgsFromRequest } from "./core/utils";

type UseApiQueryOptions<
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
> = Omit<
  UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  "queryKey" | "queryFn"
> & { queryKey?: TQueryKey };

type UseApiInfiniteQueryOptions<
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
  TPageParam,
> = Omit<
  UseInfiniteQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >,
  "queryKey" | "queryFn"
> & { queryKey?: TQueryKey };

/** variables: void | single arg | tuple */
type MutationVariables<TArgs extends readonly unknown[]> =
  TArgs extends readonly [] ? void
  : TArgs extends readonly [infer A] ? A
  : TArgs;

function toArgsTuple<TArgs extends readonly unknown[]>(
  variables: MutationVariables<TArgs>,
  arity: number,
): TArgs {
  if (variables === undefined) return [] as unknown as TArgs;
  if (arity === 1) return [variables] as unknown as TArgs;
  if (Array.isArray(variables)) return variables as unknown as TArgs;
  return [variables] as unknown as TArgs;
}

function isArgsTuple(x: unknown): x is readonly unknown[] {
  return Array.isArray(x);
}

/**
 * Три базовых хука над ApiCoreBase (см. ../core/core.ts) — сам вызов,
 * логирование и нормализация ошибок уже сделаны там (`core.callEndpoint`),
 * здесь только привязка к React через `@tanstack/react-query`.
 */
function createHookLayer(core: ApiCoreBase) {
  function useApiQuery<
    TQueryFnData,
    TError = ApiError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    fn: NestiaEndpoint<readonly [], TQueryFnData>,
    options?: UseApiQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): UseQueryResult<TData, TError>;

  function useApiQuery<
    TArgs extends readonly unknown[],
    TQueryFnData,
    TError = ApiError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    fn: NestiaEndpoint<TArgs, TQueryFnData>,
    args: TArgs,
    options?: UseApiQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): UseQueryResult<TData, TError>;

  function useApiQuery<
    TArgs extends readonly unknown[],
    TQueryFnData,
    TError = ApiError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    fn: NestiaEndpoint<TArgs, TQueryFnData>,
    argsOrOptions?:
      | TArgs
      | UseApiQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    maybeOptions?: UseApiQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): UseQueryResult<TData, TError> {
    const args = (isArgsTuple(argsOrOptions) ? argsOrOptions : []) as TArgs;

    const options = (isArgsTuple(argsOrOptions)
      ? maybeOptions
      : argsOrOptions) as
      | UseApiQueryOptions<TQueryFnData, TError, TData, TQueryKey>
      | undefined;

    const queryKey =
      options?.queryKey ??
      (core.defaultQueryKey(fn, args) as TQueryKey);

    return useQuery<TQueryFnData, TError, TData, TQueryKey>({
      ...(options ?? {}),
      retry: false,
      queryKey,
      queryFn: (ctx: QueryFunctionContext<TQueryKey>) =>
        core.callEndpoint(fn, args, ctx.signal) as Promise<TQueryFnData>,
    });
  }

  function useApiInfiniteQuery<
    TArgs extends readonly unknown[],
    TQueryFnData,
    TError = ApiError,
    TData = InfiniteData<TQueryFnData>,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = unknown,
  >(
    fn: NestiaEndpoint<TArgs, TQueryFnData>,
    getArgs: (pageParam: TPageParam) => TArgs,
    options: UseApiInfiniteQueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryKey,
      TPageParam
    >,
  ): UseInfiniteQueryResult<TData, TError> {
    const initialArgs = getArgs(options.initialPageParam as TPageParam);
    const queryKey =
      options.queryKey ??
      (core.defaultQueryKey(fn, initialArgs) as TQueryKey);

    return useInfiniteQuery<
      TQueryFnData,
      TError,
      TData,
      TQueryKey,
      TPageParam
    >({
      ...options,
      queryKey,
      queryFn: (ctx) => {
        const args = getArgs(ctx.pageParam as TPageParam);
        return core.callEndpoint(fn, args, ctx.signal) as Promise<TQueryFnData>;
      },
    });
  }

  function useApiMutation<
    TArgs extends readonly unknown[],
    TData,
    TError = ApiError,
    TContext = unknown,
  >(
    fn: NestiaEndpoint<TArgs, TData>,
    options?: UseMutationOptions<
      TData,
      TError,
      MutationVariables<TArgs>,
      TContext
    >,
  ): UseMutationResult<TData, TError, MutationVariables<TArgs>, TContext> {
    const arity = fn.length - 1;

    return useMutation<TData, TError, MutationVariables<TArgs>, TContext>({
      ...(options ?? {}),
      mutationFn: async (variables) => {
        const args = toArgsTuple<TArgs>(variables, arity);
        return core.callEndpoint(fn, args, null);
      },
    });
  }

  return { useApiQuery, useApiInfiniteQuery, useApiMutation };
}

type HookLayer = ReturnType<typeof createHookLayer>;

/**
 * Хуковый слой над createRouteCore (см. ../core/routes.ts) — тот же
 * route-строковый адрес, что и там, плюс биндинг к React. useSdkMutation не
 * переиспользует useApiMutation как есть (у него другая форма variables —
 * {params,query,body}, а не позиционный tuple), поэтому зовёт useMutation
 * напрямую, но через core.callEndpoint — тот же логгер/error-mapping, что у
 * остальных хуков.
 */
function createRouteHooks<TSdk extends object>(
  routeCore: RouteCore<TSdk>,
  core: ApiCoreBase,
  hooks: HookLayer,
) {
  type Routes = FlattenRoutes<TSdk>;
  type RouteKey = keyof Routes & string;

  type MethodOf<K extends string> = K extends `${infer M} ${string}` ? M : never;
  type QueryRouteKey = { [K in RouteKey]: MethodOf<K> extends "GET" ? K : never }[RouteKey];
  type MutationRouteKey = Exclude<RouteKey, QueryRouteKey>;

  type ResolvedFn = Function & { METADATA: { path: string; request: unknown } };

  function useSdkQuery<
    K extends QueryRouteKey,
    TError = ApiError,
    TData = RouteOutput<Routes[K]>,
    TQueryKey extends QueryKey = QueryKey,
  >(
    key: K,
    ...rest: IsEmptyRequest<RouteRequest<Routes, K>> extends true
      ? [options?: UseApiQueryOptions<RouteOutput<Routes[K]>, TError, TData, TQueryKey>]
      : [
          request: RouteRequest<Routes, K>,
          options?: UseApiQueryOptions<RouteOutput<Routes[K]>, TError, TData, TQueryKey>,
        ]
  ): UseQueryResult<TData, TError> {
    const fn = routeCore.resolve(key) as unknown as ResolvedFn;
    const arity = fn.length - 1;
    const request = arity > 0 ? (rest[0] as Record<string, unknown>) : {};
    const options = arity > 0 ? rest[1] : rest[0];
    const args = buildArgsFromRequest(fn, request);
    return (hooks.useApiQuery as any)(fn, args, options);
  }

  function useSdkMutation<K extends MutationRouteKey, TContext = unknown>(
    key: K,
    options?: UseMutationOptions<RouteOutput<Routes[K]>, ApiError, RouteRequest<Routes, K>, TContext>,
  ): UseMutationResult<RouteOutput<Routes[K]>, ApiError, RouteRequest<Routes, K>, TContext> {
    const fn = routeCore.resolve(key) as unknown as ResolvedFn;
    return useMutation({
      ...(options ?? {}),
      mutationFn: async (request: RouteRequest<Routes, K>): Promise<RouteOutput<Routes[K]>> => {
        const args = buildArgsFromRequest(fn, request as Record<string, unknown>);
        return core.callEndpoint(fn as any, args, null) as Promise<RouteOutput<Routes[K]>>;
      },
    }) as any;
  }

  function useSdkInfiniteQuery<
    K extends QueryRouteKey,
    TData = InfiniteData<RouteOutput<Routes[K]>>,
    TPageParam = unknown,
  >(
    key: K,
    getRequest: (pageParam: TPageParam) => RouteRequest<Routes, K>,
    options: UseApiInfiniteQueryOptions<RouteOutput<Routes[K]>, ApiError, TData, QueryKey, TPageParam>,
  ): UseInfiniteQueryResult<TData, ApiError> {
    const fn = routeCore.resolve(key) as unknown as ResolvedFn;
    const getArgs = (pageParam: TPageParam) =>
      buildArgsFromRequest(fn, getRequest(pageParam) as Record<string, unknown>);
    return hooks.useApiInfiniteQuery(fn as any, getArgs as any, options as any) as any;
  }

  return {
    useQuery: useSdkQuery,
    useMutation: useSdkMutation,
    useInfiniteQuery: useSdkInfiniteQuery,
  };
}

export function createApiHooks<TSdk extends object>(
  config: Omit<ApiCoreConfig, "connection"> & {
    connection: IConnection<ConnectionHeaders<TSdk>>;
    sdk: TSdk;
  },
): ApiCoreBase &
  HookLayer &
  RouteCore<TSdk> &
  ReturnType<typeof createRouteHooks<TSdk>>;
export function createApiHooks(config: ApiCoreConfig): ApiCoreBase & HookLayer;
export function createApiHooks(config: ApiCoreConfig & { sdk?: object }) {
  const core = createApiCore(config as any);
  const hooks = createHookLayer(core);
  if (config.sdk === undefined) return { ...core, ...hooks };
  return {
    ...core,
    ...hooks,
    ...createRouteHooks(core as RouteCore<any>, core, hooks),
  };
}
