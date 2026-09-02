import { HttpError, type IConnection } from "@nestia/fetcher";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  type InfiniteData,
  type QueryClient,
  type QueryFunctionContext,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

/** Для HTML-страниц типа nginx 502/503 */
function isHtmlString(x: unknown): x is string {
  return typeof x === "string" && /^\s*</.test(x);
}

function makeHttpStatusMessage(status: number): string {
  return `Ошибка запроса (${status}).`;
}

/**
 * Обработка @nestia/fetcher HttpError:
 * - status/method/path берем из HttpError
 * - body берем из err.toJSON().message (там уже: object если JSON, string если не JSON)
 * - если body = HTML => кладём в data, message делаем "HTTP 502" (или "Ошибка запроса")
 * - если body = JSON => кладём в data, message вынимаем через pickErrorMessage(...)
 */
function toApiErrorFromHttpError<T = unknown>(
  err: HttpError,
  meta?: { url?: string; method?: string },
): ApiError<T> {
  const props = err.toJSON<unknown>();

  const status = props.status;
  const method = (meta?.method ?? props.method)?.toUpperCase();
  const url = meta?.url ?? joinUrl(undefined, props.path);

  const payload = props.message; // object | string
  const data: unknown = payload;

  const fallbackMessage = makeHttpStatusMessage(status);

  const message =
    isHtmlString(payload)
      ? fallbackMessage
      : pickErrorMessage(payload, fallbackMessage);

  const code = pickErrorCode(payload);

  return {
    message,
    code,
    status,
    data,
    url,
    method,
    isNetworkError: false,
    e: err as unknown as T,
  };
}

/** Сигнатура любой функции из Nestia SDK */
export type NestiaEndpoint<TArgs extends readonly unknown[], TOut> = (
  connection: IConnection,
  ...args: TArgs
) => Promise<TOut>;

type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/**
 * Разворачивает вложенный namespace сгенерированного Nestia SDK (functional)
 * в плоскую карту "МЕТОД /путь" -> сама функция-эндпоинт. METADATA у каждого
 * эндпоинта объявлена как `as const`, поэтому method/path — литеральные типы,
 * не просто string — отсюда и автокомплит валидных route-строк, и ошибка
 * типов на несуществующий путь/метод (проверено живьём на реальном
 * сгенерированном packages/nest-api-client).
 */
export type FlattenRoutes<T> = T extends NestiaEndpoint<any, any>
  ? T extends {
      METADATA: { method: infer M extends string; path: infer P extends string };
    }
    ? { [K in `${M} ${P}`]: T }
    : {}
  : T extends object
    ? UnionToIntersection<{ [K in keyof T]: FlattenRoutes<T[K]> }[keyof T]>
    : {};

type RouteArgs<T> = T extends (connection: IConnection, ...args: infer A) => any ? A : never;
type RouteOutput<T> = T extends (...args: any[]) => Promise<infer O> ? O : never;

// точное сравнение типов (не extends в одну сторону, а "совпадает ровно")
type IsExactly<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

/**
 * Headers, которые ХОТЯ БЫ один роут в SDK просит через @TypedHeaders()
 * (IConnection<Headers> на его connection-параметре). Дефолтный
 * IConnection<object | undefined> (роуты без @TypedHeaders()) исключается —
 * иначе он бы "засорял" пересечение ниже.
 */
type ConnectionHeadersOf<T> = T extends (connection: IConnection<infer H>, ...args: any[]) => any
  ? IsExactly<H, object | undefined> extends true
    ? never
    : H
  : T extends object
    ? { [K in keyof T]: ConnectionHeadersOf<T[K]> }[keyof T]
    : never;

/**
 * Headers-тип connection'а, выведенный из ВСЕХ роутов конкретного sdk — не
 * enforcement (у самого nestia Headerify делает все поля опциональными, так
 * что заставить нельзя, проверено живьём), а просто автокомплит: пишешь
 * connection.headers = { — IDE подскажет "authorization", если хоть один
 * роут в sdk просит его через @TypedHeaders().
 */
type RawConnectionHeaders<TSdk> = [ConnectionHeadersOf<TSdk>] extends [never]
  ? object | undefined
  : UnionToIntersection<ConnectionHeadersOf<TSdk>>;

// TS не может абстрактно доказать (без конкретного TSdk), что
// RawConnectionHeaders<TSdk> лежит в constraint'е IConnection (object |
// undefined) — хотя по построению это всегда так. Стандартный приём: обернуть
// в T extends object|undefined ? T : fallback, это TS доказывает для любого T.
type ConnectionHeaders<TSdk> = RawConnectionHeaders<TSdk> extends object | undefined
  ? RawConnectionHeaders<TSdk>
  : object | undefined;

/**
 * Имена path-параметров из строки пути, ПО ПОРЯДКУ (":id" -> "id"). Порядок
 * важен — он должен совпадать с порядком первых N элементов RouteArgs
 * (nestia генерирует path-параметры именно в таком порядке, ДО query/body).
 */
type PathParamTuple<P extends string> = P extends `${string}:${infer Param}/${infer Rest}`
  ? [Param, ...PathParamTuple<`/${Rest}`>]
  : P extends `${string}:${infer Param}`
    ? [Param]
    : [];

type PathOf<K extends string> = K extends `${string} ${infer P}` ? P : never;

/** Разбивает tuple на "первые N" и "остальное". */
type SplitAt<
  T extends readonly unknown[],
  N extends number,
  Acc extends readonly unknown[] = [],
> = Acc["length"] extends N
  ? [Acc, T]
  : T extends readonly [infer Head, ...infer Tail]
    ? SplitAt<Tail, N, [...Acc, Head]>
    : [Acc, T];

/** Склеивает упорядоченные имена ("id") с упорядоченными значениями (string) в { id: string }. */
type ZipNames<Names extends readonly string[], Values extends readonly unknown[]> =
  Names extends readonly [infer N extends string, ...infer NR extends readonly string[]]
    ? Values extends readonly [infer V, ...infer VR extends readonly unknown[]]
      ? { [K in N]: V } & ZipNames<NR, VR>
      : {}
    : {};

type HasBody<T> = T extends { METADATA: { request: null } } ? false : true;

/**
 * Branded-заглушка для роутов, которые {params, query, body} разложить
 * однозначно не может (2+ "лишних" аргументов сверх path-параметров — это
 * значит query/headers раскиданы на отдельные @Query()/@Headers() поля, а не
 * один целый DTO). Специально не просто `never` — сообщение видно прямо в
 * ошибке компиляции ("Property '...' is missing"), а не голое "not never".
 * headers НЕ участвуют в подсчёте: у nestia это часть connection (через
 * IConnection<Headers>), а не отдельный аргумент функции — проверено живьём
 * на сгенерированном коде (@TypedHeaders() не добавляет параметр функции).
 */
type UnsupportedRoute = {
  readonly UNSUPPORTED_ROUTE_use_useApiQuery_or_useApiMutation_with_positional_args: true;
};

/** Собирает { params?, query?, body? } под конкретный route-key K. */
type RouteRequest<Routes, K extends keyof Routes & string> =
  PathParamTuple<PathOf<K>> extends infer PNames extends readonly string[]
    ? SplitAt<RouteArgs<Routes[K]>, PNames["length"]> extends [
        infer ParamValues extends readonly unknown[],
        infer Rest extends readonly unknown[],
      ]
      ? Rest["length"] extends 0
        ? ParamsSlot<PNames, ParamValues>
        : Rest["length"] extends 1
          ? ParamsSlot<PNames, ParamValues> &
              (HasBody<Routes[K]> extends true ? { body: Rest[0] } : { query: Rest[0] })
          : UnsupportedRoute
      : UnsupportedRoute
    : UnsupportedRoute;

type ParamsSlot<Names extends readonly string[], Values extends readonly unknown[]> =
  Names["length"] extends 0 ? {} : { params: ZipNames<Names, Values> };

type IsEmptyRequest<T> = keyof T extends never ? true : false;

/** Ошибка в стиле orval/axios, но для Nestia(fetch) */
export type ApiError<T = unknown> = {
  message: string;
  code?: string;
  status?: number;
  data?: unknown;
  url?: string;
  method?: string;
  isNetworkError?: boolean;
  e?: T;
};

function joinUrl(base: string | undefined, url: string | undefined) {
  const b = base ?? "";
  const u = url ?? "";
  if (!b) return u;
  if (!u) return b;
  return b.replace(/\/+$/, "") + "/" + u.replace(/^\/+/, "");
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/** Важно: функции тоже "record-like", чтобы читать fn.METADATA / fn.path */
function isRecordLike(x: unknown): x is Record<string, unknown> {
  return isObject(x) || typeof x === "function";
}

function isEndpointFn(
  v: unknown,
): v is NestiaEndpoint<any, any> & { METADATA: { method: string; path: string } } {
  if (typeof v !== "function") return false;
  const meta = (v as unknown as Record<string, unknown>)["METADATA"];
  return isObject(meta) && typeof meta.method === "string" && typeof meta.path === "string";
}

/**
 * Обходит functional-namespace SDK (произвольная вложенность через
 * `export * as X from ...`) и строит плоский индекс "МЕТОД /путь" -> сама
 * функция — рантайм-версия FlattenRoutes. Проверено живьём на реальном
 * сгенерированном SDK: ['GET /', 'GET /health'] / ['GET /users'].
 */
function buildRouteIndex(
  sdk: unknown,
  index: Record<string, Function> = {},
): Record<string, Function> {
  if (!isObject(sdk)) return index;
  for (const key of Object.keys(sdk)) {
    const value = sdk[key];
    if (isEndpointFn(value)) index[`${value.METADATA.method} ${value.METADATA.path}`] = value;
    else if (isObject(value)) buildRouteIndex(value, index);
  }
  return index;
}

/**
 * Рантайм-версия RouteRequest -> позиционные args. Имена path-параметров
 * читаются из fn.METADATA.path (те же ":id"), арность — из fn.length (минус
 * connection) — тот же приём, что уже используется для arity в
 * useApiMutation. Не гадаем по форме значения — по факту (METADATA + length).
 */
function buildArgsFromRequest(
  fn: Function & { METADATA: { path: string; request: unknown } },
  request: Record<string, unknown>,
): unknown[] {
  const paramNames = fn.METADATA.path
    .split("/")
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.slice(1));
  const params = isObject(request.params) ? request.params : {};
  const args: unknown[] = paramNames.map((name) => params[name]);

  const arity = fn.length - 1; // минус connection
  if (args.length < arity) args.push(fn.METADATA.request !== null ? request.body : request.query);

  return args;
}

/** Извлекает тело ответа из IFetchEvent (поле может называться по-разному) */
function pickEventPayload(event: unknown): unknown {
  if (!isObject(event)) return undefined;
  const e = event as Record<string, unknown>;
  return e["output"] ?? e["data"] ?? e["body"] ?? e["response"] ?? undefined;
}

type MaybeHttpError = {
  status?: unknown;
  message?: unknown;
  data?: unknown;
  body?: unknown;
  response?: {
    status?: unknown;
    data?: unknown;
    body?: unknown;
  };
};

type MaybeApiErrorPayload = {
  error_message?: unknown;
  message?: unknown;
  error?: unknown;
  error_code?: unknown;
  code?: unknown;
};

function pickErrorMessage(data: unknown, fallback: string): string {
  if (!isObject(data)) return fallback;
  const p = data as MaybeApiErrorPayload;

  if (typeof p.error_message === "string" && p.error_message.length)
    return p.error_message;
  if (typeof p.message === "string" && p.message.length) return p.message;
  if (typeof p.error === "string" && p.error.length) return p.error;

  return fallback;
}

function pickErrorCode(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  const p = data as MaybeApiErrorPayload;

  if (typeof p.error_code === "string") return p.error_code;
  if (typeof p.error_code === "number") return String(p.error_code);
  if (typeof p.code === "string") return p.code;
  if (typeof p.code === "number") return String(p.code);

  return undefined;
}

/** Нормализация ошибки (аналог toApiError из orval) */
export function toApiError<T = unknown>(
  err: unknown,
  meta?: { url?: string; method?: string },
): ApiError<T> {
  if (err instanceof HttpError) {
    return toApiErrorFromHttpError<T>(err, meta);
  }

  if (err instanceof DOMException && err.name === "AbortError") {
    console.error(err);
    return {
      message: "Request aborted",
      status: 0,
      url: meta?.url,
      method: meta?.method,
      isNetworkError: false,
      e: err as unknown as T,
    };
  }

  if (err instanceof Error) {
    return {
      message: err.message || "Ошибка запроса",
      url: meta?.url,
      method: meta?.method,
      isNetworkError:
        err.name === "TypeError" ||
        /failed to fetch/i.test(err.message) ||
        /network/i.test(err.message),
      e: err as unknown as T,
    };
  }

  if (isObject(err)) {
    const h = err as MaybeHttpError;

    const status =
      typeof h.status === "number"
        ? h.status
        : typeof h.response?.status === "number"
          ? h.response.status
          : undefined;

    const data = h.data ?? h.body ?? h.response?.data ?? h.response?.body;

    const message = pickErrorMessage(
      data,
      typeof h.message === "string" ? h.message : "Ошибка запроса",
    );

    const code = pickErrorCode(data);
    const isNetworkError = !status;

    return {
      message,
      code,
      status,
      data,
      url: meta?.url,
      method: meta?.method,
      isNetworkError,
      e: err as unknown as T,
    };
  }

  return {
    message: "Неизвестная ошибка",
    url: meta?.url,
    method: meta?.method,
    e: err as unknown as T,
  };
}

export type ApiHooksConfig = {
  /** Базовый connection (host/headers/encryption/...) */
  connection: IConnection;

  /** Как axios.withCredentials=true */
  withCredentials?: boolean;

  /**
   * Логирование.
   * - `undefined` (по умолчанию): включено только в dev
   * - `false`: полностью отключено
   * - объект с хэндлерами: пользовательский логгер (работает всегда)
   */
  logger?:
    | false
    | {
        request?: (info: {
          method?: string;
          url?: string;
          params?: unknown;
          data?: unknown;
        }) => void;

        response?: (info: {
          status?: number;
          url?: string;
          data: unknown;
        }) => void;

        error?: (info: {
          status?: number;
          url?: string;
          data?: unknown;
          message: string;
          isNetworkError?: boolean;
        }) => void;
      };

  /** Переопределение нормализации ошибок */
  mapError?: <T = unknown>(
    err: unknown,
    meta?: { url?: string; method?: string },
  ) => ApiError<T>;
};

function withSignal(connection: IConnection, signal: AbortSignal | null) {
  if (!signal) return connection;
  return {
    ...connection,
    options: {
      ...(connection.options ?? {}),
      signal,
    },
  } satisfies IConnection;
}

function withCredentials(connection: IConnection, enabled: boolean) {
  if (!enabled) return connection;
  return {
    ...connection,
    options: {
      ...(connection.options ?? {}),
      credentials: "include",
    },
  } satisfies IConnection;
}

/**
 * Достаем method/path/url из nestia endpoint:
 * - fn.METADATA.method
 * - fn.METADATA.path
 * - fn.path(...args)
 */
function getEndpointMeta(
  fn: unknown,
  host: string | undefined,
  args?: readonly unknown[],
): { method?: string; url?: string; path?: string } {
  if (!isRecordLike(fn)) return {};

  const metadata = (fn as Record<string, unknown>)["METADATA"];
  const pathFn = (fn as Record<string, unknown>)["path"];

  let method: string | undefined;
  let path: string | undefined;

  if (isRecordLike(metadata)) {
    const m = (metadata as Record<string, unknown>)["method"];
    const p = (metadata as Record<string, unknown>)["path"];
    if (typeof m === "string") method = m.toUpperCase();
    if (typeof p === "string") path = p;
  }

  if (typeof pathFn === "function") {
    try {
      const r = (pathFn as (...a: unknown[]) => unknown)(...(args ?? []));
      if (typeof r === "string") path = r;
    } catch {
      // pathFn требует аргументы, которых нет — оставляем path из METADATA
    }
  }

  return { method, path, url: joinUrl(host, path) };
}

/**
 * QueryKey по умолчанию:
 * ['api', METHOD, '/path', args]
 */
export function defaultQueryKey<TArgs extends readonly unknown[]>(
  fn: NestiaEndpoint<TArgs, unknown>,
  args: TArgs,
  host?: string,
): QueryKey {
  const meta = getEndpointMeta(fn, host, args);
  return [
    "api",
    meta.method ?? "UNKNOWN",
    meta.path ?? "UNKNOWN",
    args,
  ] as const;
}

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

async function invokeNestiaEndpoint<TArgs extends readonly unknown[], TOut>(
  fn: NestiaEndpoint<TArgs, TOut>,
  connection: IConnection,
  args: TArgs,
): Promise<TOut> {
  const call = fn as (
    connection: IConnection,
    ...a: readonly unknown[]
  ) => Promise<TOut>;
  return call(connection, ...args);
}

function splitArgsForLog(method: string | undefined, args: readonly unknown[]) {
  const m = method?.toUpperCase();

  if (args.length === 0) return { params: undefined, data: undefined };

  if (args.length === 1) {
    if (m === "GET" || m === "DELETE")
      return { params: args[0], data: undefined };
    return { params: undefined, data: args[0] };
  }

  return {
    params: args.slice(0, -1),
    data: args[args.length - 1],
  };
}

function isArgsTuple(x: unknown): x is readonly unknown[] {
  return Array.isArray(x);
}

declare const process: { env: Record<string, string | undefined> } | undefined;

function detectDev(): boolean {
  try {
    if (import.meta.env?.DEV !== undefined) return !!import.meta.env.DEV;
  } catch { /* not available */ }

  try {
    if (typeof process !== "undefined" && process?.env.NODE_ENV !== undefined) {
      return process.env.NODE_ENV !== "production";
    }
  } catch { /* not available */ }

  return true;
}

const isDev: boolean = detectDev();

function createApiHooksBase(config: ApiHooksConfig) {
  const mapError = config.mapError ?? toApiError;

  const baseConnection = withCredentials(
    config.connection,
    config.withCredentials ?? true,
  );

  const defaultDevLogger = {
    request: (info: {
      method?: string;
      url?: string;
      params?: unknown;
      data?: unknown;
    }) => {
      console.log("%cAPI request →", "color: yellow; font-weight: bold;");
      console.log({
        method: info.method,
        url: info.url,
        params: info.params,
        data: info.data,
      });
    },

    response: (info: { status?: number; url?: string; data: unknown }) => {
      console.log("%c← API response", "color: green; font-weight: bold;");
      console.log({
        status: info.status,
        url: info.url,
        data: info.data,
      });
    },

    error: (info: {
      status?: number;
      url?: string;
      data?: unknown;
      message: string;
      isNetworkError?: boolean;
    }) => {
      if (info.isNetworkError) {
        console.log(
          "%cБЛЯТЬ",
          "color: red; font-size: 32px; text-decoration: underline;font-family: Arial Narrow, sans-serif; font-weight: bold;",
        );
        console.error(info.message);
      } else {
        console.log(
          "%cБЛЯТЬ",
          "color: red; font-size: 32px; text-decoration: underline; font-family: Arial Narrow, sans-serif; font-weight: bold;",
        );
        console.error(info);
        console.error({
          status: info.status,
          url: info.url,
          data: info.data,
        });
      }
    },
  };

  const noopLogger = {
    request: () => {},
    response: () => {},
    error: () => {},
  };

  const resolvedLoggerConfig =
    config.logger === false
      ? noopLogger
      : config.logger === undefined
        ? isDev
          ? defaultDevLogger
          : noopLogger
        : config.logger;

  const logger = {
    request: resolvedLoggerConfig.request ?? defaultDevLogger.request,
    response: resolvedLoggerConfig.response ?? defaultDevLogger.response,
    error: resolvedLoggerConfig.error ?? defaultDevLogger.error,
  };

  async function callEndpoint<TArgs extends readonly unknown[], TOut>(
    fn: NestiaEndpoint<TArgs, TOut>,
    args: TArgs,
    signal?: AbortSignal | null,
  ): Promise<TOut> {
    const meta = getEndpointMeta(fn, baseConnection.host, args);
    const { params, data } = splitArgsForLog(meta.method, args);

    logger.request({
      method: meta.method,
      url: meta.url,
      params,
      data,
    });

    const conn: IConnection = {
      ...withSignal(baseConnection, signal ?? null),
      logger: async (event) => {
        const status =
          typeof event.status === "number" ? event.status : undefined;
        const url = joinUrl(baseConnection.host, event.path);
        const output = pickEventPayload(event);

        if (status === undefined || status < 400) {
          logger.response({ status, url, data: output });
        }

        if (typeof baseConnection.logger === "function") {
          try {
            await baseConnection.logger(event);
          } catch (logErr) {
            if (isDev) console.warn("base connection logger threw:", logErr);
          }
        }
      },
    };

    try {
      return await invokeNestiaEndpoint(fn, conn, args);
    } catch (err) {
      const apiError = mapError(err, meta);

      if (apiError.message !== "Request aborted") {
        logger.error({
          status: apiError.status,
          url: apiError.url,
          data: apiError.data,
          message: apiError.message,
          isNetworkError: apiError.isNetworkError,
        });
      }

      throw apiError;
    }
  }

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
      (defaultQueryKey(fn, args, baseConnection.host) as TQueryKey);

    return useQuery<TQueryFnData, TError, TData, TQueryKey>({
      ...(options ?? {}),
      retry: false,
      queryKey,
      queryFn: (ctx: QueryFunctionContext<TQueryKey>) =>
        callEndpoint(fn, args, ctx.signal) as Promise<TQueryFnData>,
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
      (defaultQueryKey(fn, initialArgs, baseConnection.host) as TQueryKey);

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
        return callEndpoint(fn, args, ctx.signal) as Promise<TQueryFnData>;
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
        return callEndpoint(fn, args, null);
      },
    });
  }

  function getEndpointQueryKey<TArgs extends readonly unknown[]>(
    fn: NestiaEndpoint<TArgs, unknown>,
    args?: TArgs,
  ): QueryKey {
    const meta = getEndpointMeta(fn, baseConnection.host, args);
    const key: unknown[] = [
      "api",
      meta.method ?? "UNKNOWN",
      meta.path ?? "UNKNOWN",
    ];
    if (args !== undefined) key.push(args);
    return key;
  }

  function invalidateEndpoint<TArgs extends readonly unknown[]>(
    queryClient: QueryClient,
    fn: NestiaEndpoint<TArgs, unknown>,
    args?: TArgs,
  ) {
    return queryClient.invalidateQueries({
      queryKey: getEndpointQueryKey(fn, args),
    });
  }

  function resetEndpoint<TArgs extends readonly unknown[]>(
    queryClient: QueryClient,
    fn: NestiaEndpoint<TArgs, unknown>,
    args?: TArgs,
  ) {
    return queryClient.resetQueries({
      queryKey: getEndpointQueryKey(fn, args),
    });
  }

  function prefetchEndpoint<TArgs extends readonly unknown[], TData>(
    queryClient: QueryClient,
    fn: NestiaEndpoint<TArgs, TData>,
    args: TArgs,
  ) {
    return queryClient.prefetchQuery({
      queryKey: defaultQueryKey(fn, args, baseConnection.host),
      queryFn: () => callEndpoint(fn, args, null),
    });
  }

  return {
    hooks: {
      useApiQuery,
      useApiInfiniteQuery,
      useApiMutation,
      toApiError: mapError,
      defaultQueryKey,
      getEndpointQueryKey,
      invalidateEndpoint,
      resetEndpoint,
      prefetchEndpoint,
    },
    // Не часть публичного API (не попадает в ApiHooksBase) — только для
    // createRouteHooks: useSdkMutation не может переиспользовать
    // useApiMutation как есть (у него другая форма variables, см. ниже),
    // но должен получать те же логи/error-mapping, что и остальные хуки.
    callEndpoint,
  };
}

type ApiHooksBase = ReturnType<typeof createApiHooksBase>["hooks"];

/**
 * Слой над createApiHooksBase, ключующий эндпоинты по route-строке
 * "МЕТОД /путь" (FlattenRoutes<TSdk>) вместо явной передачи функции из SDK.
 * Один вызов createApiHooks({ sdk }) — один сгенерированный Nestia-клиент;
 * для другого клиента (другой entry point) фабрика вызывается ещё раз,
 * мерджа между несколькими sdk в одном вызове нет — так решили осознанно,
 * чтобы не разбираться с коллизиями "МЕТОД /путь" между разными клиентами.
 */
function createRouteHooks<TSdk extends object>(
  sdk: TSdk,
  base: ApiHooksBase,
  callEndpoint: ReturnType<typeof createApiHooksBase>["callEndpoint"],
) {
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
    if (!fn) throw new Error(`[createApiHooks] неизвестный route: "${key}"`);
    return fn as Routes[K];
  }

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
    const fn = resolve(key) as unknown as ResolvedFn;
    const arity = fn.length - 1;
    const request = arity > 0 ? (rest[0] as Record<string, unknown>) : {};
    const options = arity > 0 ? rest[1] : rest[0];
    const args = buildArgsFromRequest(fn, request);
    return (base.useApiQuery as any)(fn, args, options);
  }

  function useSdkMutation<K extends MutationRouteKey, TContext = unknown>(
    key: K,
    options?: UseMutationOptions<RouteOutput<Routes[K]>, ApiError, RouteRequest<Routes, K>, TContext>,
  ): UseMutationResult<RouteOutput<Routes[K]>, ApiError, RouteRequest<Routes, K>, TContext> {
    const fn = resolve(key) as unknown as ResolvedFn;
    // useApiMutation тут не годится — у него другая форма variables
    // (MutationVariables<TArgs>, позиционная), а не именованный
    // {params, query, body}. Зовём useMutation напрямую, но через
    // callEndpoint — тот же логгер/error-mapping, что у остальных хуков.
    return useMutation({
      ...(options ?? {}),
      mutationFn: async (request: RouteRequest<Routes, K>): Promise<RouteOutput<Routes[K]>> => {
        const args = buildArgsFromRequest(fn, request as Record<string, unknown>);
        return callEndpoint(fn as any, args, null) as Promise<RouteOutput<Routes[K]>>;
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
    const fn = resolve(key) as unknown as ResolvedFn;
    const getArgs = (pageParam: TPageParam) =>
      buildArgsFromRequest(fn, getRequest(pageParam) as Record<string, unknown>);
    return base.useApiInfiniteQuery(fn as any, getArgs as any, options as any) as any;
  }

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
    useQuery: useSdkQuery,
    useMutation: useSdkMutation,
    useInfiniteQuery: useSdkInfiniteQuery,
    queryKey: routeQueryKey,
    invalidate: invalidateRoute,
    reset: resetRoute,
    prefetch: prefetchRoute,
  };
}

export function createApiHooks<TSdk extends object>(
  config: Omit<ApiHooksConfig, "connection"> & {
    connection: IConnection<ConnectionHeaders<TSdk>>;
    sdk: TSdk;
  },
): ApiHooksBase & ReturnType<typeof createRouteHooks<TSdk>>;
export function createApiHooks(config: ApiHooksConfig): ApiHooksBase;
export function createApiHooks(config: ApiHooksConfig & { sdk?: object }) {
  const { hooks, callEndpoint } = createApiHooksBase(config);
  if (config.sdk === undefined) return hooks;
  return { ...hooks, ...createRouteHooks(config.sdk, hooks, callEndpoint) };
}