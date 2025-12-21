/**
 * SSR адаптер для Fetch API (Request/Response)
 * Универсальный стандарт для веба - работает в Node.js, Edge Runtime, Cloudflare Workers и т.д.
 */

import type { RouteContract, PageInput, PageViewInput, SeoDescriptor, PageResultType } from '../types';
import { runPage } from '../runtime';
import { extractParams, parseQuery } from '../utils';

/**
 * Опции для SSR адаптера Fetch API
 */
export interface SsrFetchAdapterOptions {
  /**
   * Функция для рендеринга HTML страницы
   * request передается для доступа к URL и другим данным запроса
   */
  renderHtml?: (ctx: unknown, seo?: SeoDescriptor, request?: Request, pageInput?: PageViewInput) => string | Promise<string>;
  
  /**
   * Функция для рендеринга 404 страницы
   */
  render404?: () => string | Promise<string>;
  
  /**
   * Функция для рендеринга страницы ошибки
   */
  renderError?: (error: unknown, status?: number) => string | Promise<string>;
}

/**
 * Обработчик SSR запроса для Fetch API
 * 
 * Интерпретирует результат PageFunction и возвращает Response
 * 
 * @param route - Контракт маршрута
 * @param request - HTTP запрос (Fetch API)
 * @param options - Опции адаптера
 * @returns HTTP ответ (Fetch API)
 * 
 * @example
 * ```ts
 * const response = await handleSsrRequestFetch(
 *   match.route,
 *   request,
 *   {
 *     renderHtml: (ctx, seo) => {
 *       return renderReactApp(ctx, seo);
 *     }
 *   }
 * );
 * ```
 */
export async function handleSsrRequestFetch(
  route: RouteContract,
  request: Request,
  options: SsrFetchAdapterOptions = {}
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  const input: PageInput = {
    params: extractParams(route.path, pathname),
    query: parseQuery(request.url),
    headers: Object.fromEntries(request.headers.entries()),
    request: {
      url: request.url,
      method: request.method || 'GET',
    },
  };
  
  const result = await runPage(route.page, input);
  
  switch (result.type) {
    case 'redirect':
      return new Response(null, {
        status: result.status || 302,
        headers: {
          Location: result.to,
        },
      });

    case 'not-found':
      // not-found обрабатывается самой страницей через renderHtml
      // Если контекст не передан, используем дефолтный объект
      const notFoundCtx = result.ctx ?? { notFound: true };
      const notFoundPageInput: PageViewInput = {
        ...input,
        resultType: 'not-found' as PageResultType,
      };
      const notFoundHtml = options.renderHtml
        ? await options.renderHtml(notFoundCtx, result.seo, request, notFoundPageInput)
        : '<html><body><h1>404 Not Found</h1></body></html>';
      
      return new Response(notFoundHtml, {
        status: result.status || 404,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });

    case 'error':
      const errorHtml = options.renderError
        ? await options.renderError(result.error, result.status)
        : `<html><body><h1>Error ${result.status || 500}</h1><p>${result.error}</p></body></html>`;
      return new Response(errorHtml, {
        status: result.status || 500,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });

    case 'ok':
      const okPageInput: PageViewInput = {
        ...input,
        resultType: 'ok' as PageResultType,
      };
      const html = options.renderHtml
        ? await options.renderHtml(result.ctx, result.seo, request, okPageInput)
        : JSON.stringify({ ctx: result.ctx, seo: result.seo });
      
      const contentType = options.renderHtml
        ? 'text/html; charset=utf-8'
        : 'application/json';
      
      return new Response(html, {
        status: result.status || 200,
        headers: {
          'Content-Type': contentType,
        },
      });
  }
}

