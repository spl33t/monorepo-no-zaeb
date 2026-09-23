import { HttpError } from "@nestia/fetcher";
import { isObject, joinUrl } from "./utils";

/** Для HTML-страниц типа nginx 502/503 */
function isHtmlString(x: unknown): x is string {
  return typeof x === "string" && /^\s*</.test(x);
}

function makeHttpStatusMessage(status: number): string {
  return `Ошибка запроса (${status}).`;
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

/** Извлекает тело ответа из IFetchEvent (поле может называться по-разному) */
export function pickEventPayload(event: unknown): unknown {
  if (!isObject(event)) return undefined;
  const e = event as Record<string, unknown>;
  return e["output"] ?? e["data"] ?? e["body"] ?? e["response"] ?? undefined;
}

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
