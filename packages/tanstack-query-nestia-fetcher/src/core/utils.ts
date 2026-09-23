import type { IConnection } from "@nestia/fetcher";
import type { NestiaEndpoint } from "./types";

export function joinUrl(base: string | undefined, url: string | undefined) {
  const b = base ?? "";
  const u = url ?? "";
  if (!b) return u;
  if (!u) return b;
  return b.replace(/\/+$/, "") + "/" + u.replace(/^\/+/, "");
}

export function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/** Важно: функции тоже "record-like", чтобы читать fn.METADATA / fn.path */
export function isRecordLike(x: unknown): x is Record<string, unknown> {
  return isObject(x) || typeof x === "function";
}

export function isEndpointFn(
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
export function buildRouteIndex(
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
export function buildArgsFromRequest(
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

/**
 * Достаем method/path/url из nestia endpoint:
 * - fn.METADATA.method
 * - fn.METADATA.path
 * - fn.path(...args)
 */
export function getEndpointMeta(
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

export function splitArgsForLog(method: string | undefined, args: readonly unknown[]) {
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

export function withSignal(connection: IConnection, signal: AbortSignal | null) {
  if (!signal) return connection;
  return {
    ...connection,
    options: {
      ...(connection.options ?? {}),
      signal,
    },
  } satisfies IConnection;
}

export function withCredentials(connection: IConnection, enabled: boolean) {
  if (!enabled) return connection;
  return {
    ...connection,
    options: {
      ...(connection.options ?? {}),
      credentials: "include",
    },
  } satisfies IConnection;
}

declare const process: { env: Record<string, string | undefined> } | undefined;

export function detectDev(): boolean {
  try {
    // Кастуем сами, а не полагаемся на глобальный тип ImportMeta (его `env`
    // добавляет vite/client) — этот пакет теперь vanilla-first и не должен
    // требовать vite/client в types consumer'а только чтобы протайпчекаться
    // (проверено живьём: без этого падает TS2339 при tsc против пакета в
    // изоляции, где vite/client не подключён).
    const meta = import.meta as unknown as { env?: { DEV?: boolean } };
    if (meta.env?.DEV !== undefined) return !!meta.env.DEV;
  } catch { /* not available */ }

  try {
    if (typeof process !== "undefined" && process?.env.NODE_ENV !== undefined) {
      return process.env.NODE_ENV !== "production";
    }
  } catch { /* not available */ }

  return true;
}

export const isDev: boolean = detectDev();
