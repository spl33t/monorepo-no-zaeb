import type { IncomingMessage, ServerResponse } from 'http'
import type { RouteContract } from '../types'
import type { PageInput } from '../types'
import { runPage } from '../runtime'
import { extractParams, parseQuery } from '../utils'

/**
 * Опции для SSR адаптера
 */
export interface SsrAdapterOptions {
  /**
   * Функция для рендеринга HTML страницы
   */
  renderHtml?: (ctx: unknown, seo?: any) => string
  
  /**
   * Функция для рендеринга 404 страницы
   */
  render404?: () => string
}

/**
 * Обработчик SSR запроса
 * 
 * Интерпретирует результат PageFunction и выполняет соответствующие side-effects
 * 
 * @param route - Контракт маршрута
 * @param req - HTTP запрос (Node.js)
 * @param res - HTTP ответ (Node.js)
 * @param options - Опции адаптера
 */
export async function handleSsrRequest(
  route: RouteContract,
  req: IncomingMessage,
  res: ServerResponse,
  options: SsrAdapterOptions = {}
): Promise<void> {
  const url = req.url || '/'
  
  const input: PageInput = {
    params: extractParams(route.path, url),
    query: parseQuery(url),
    headers: req.headers as Record<string, string>,
    request: {
      url,
      method: req.method || 'GET'
    }
  }
  
  const result = await runPage(route.page, input)
  
  switch (result.type) {
    case 'redirect':
      res.statusCode = result.status ?? 302
      res.setHeader('Location', result.to)
      res.end()
      return

    case 'not-found':
      res.statusCode = 404
      if (options.render404) {
        res.end(options.render404())
      } else {
        res.end('404 Not Found')
      }
      return

    case 'error':
      res.statusCode = result.status ?? 500
      res.end(`Error: ${result.error}`)
      return

    case 'ok':
      res.statusCode = result.status ?? 200
      if (options.renderHtml) {
        res.end(options.renderHtml(result.ctx, result.seo))
      } else {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ctx: result.ctx, seo: result.seo }))
      }
      return
  }
}

