import type { IConnection } from "@nestia/fetcher";
import type { QueryClient, QueryKey } from "@tanstack/query-core";
import { type ApiError, pickEventPayload, toApiError } from "./errors";
import type { ConnectionHeaders, NestiaEndpoint } from "./types";
import {
  getEndpointMeta,
  isDev,
  joinUrl,
  splitArgsForLog,
  withCredentials,
  withSignal,
} from "./utils";
import { createRouteCore } from "./routes";

export type ApiCoreConfig = {
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

function createApiCoreBase(config: ApiCoreConfig) {
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
      const call = fn as (
        connection: IConnection,
        ...a: readonly unknown[]
      ) => Promise<TOut>;
      return await call(conn, ...args);
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
    callEndpoint,
    toApiError: mapError,
    defaultQueryKey,
    getEndpointQueryKey,
    invalidateEndpoint,
    resetEndpoint,
    prefetchEndpoint,
  };
}

export type ApiCoreBase = ReturnType<typeof createApiCoreBase>;

/**
 * Единственная точка входа вниллы: без `sdk` — просто набор операций над
 * QueryClient/callEndpoint, где эндпоинт передаётся явной функцией из SDK.
 * С `sdk` — то же самое плюс route-строковый слой (`resolve`/`queryKey`/
 * `invalidate`/`reset`/`prefetch`, см. ./routes) поверх него. Никакого
 * React/`@tanstack/react-query` на этом уровне — см. ../react.ts, которая
 * зовёт createApiCore и добавляет хуки сверху.
 */
export function createApiCore<TSdk extends object>(
  config: Omit<ApiCoreConfig, "connection"> & {
    connection: IConnection<ConnectionHeaders<TSdk>>;
    sdk: TSdk;
  },
): ApiCoreBase & ReturnType<typeof createRouteCore<TSdk>>;
export function createApiCore(config: ApiCoreConfig): ApiCoreBase;
export function createApiCore(config: ApiCoreConfig & { sdk?: object }) {
  const base = createApiCoreBase(config);
  if (config.sdk === undefined) return base;
  return { ...base, ...createRouteCore(config.sdk, base) };
}
