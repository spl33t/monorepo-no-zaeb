/**
 * SEO дескриптор для мета-информации страницы
 */
export interface SeoDescriptor {
  title?: string
  description?: string
  meta?: Record<string, string>
}

/**
 * Результат выполнения PageFunction
 * Единственный источник правды для всех адаптеров
 */
export type PageResult<Ctx = unknown> =
  | {
      type: 'ok'
      ctx: Ctx
      seo?: SeoDescriptor
      status?: number
    }
  | {
      type: 'redirect'
      to: string
      status?: 301 | 302 | 307 | 308
    }
  | {
      type: 'not-found'
    }
  | {
      type: 'error'
      error: unknown
      status?: number
    }

/**
 * Входные данные для PageFunction
 * Агностик к платформе (SSR/SPA)
 */
export interface PageInput<Params = any> {
  params: Params
  query: Record<string, string | string[]>
  headers?: Record<string, string>
  cookies?: Record<string, string>
  request?: {
    url: string
    method: string
  }
}

/**
 * PageFunction - чистая бизнес-функция
 * Не знает, где выполняется (SSR или SPA)
 * Возвращает декларативный результат
 */
export type PageFunction<Params = any, Ctx = any> = (
  input: PageInput<Params>
) => Promise<PageResult<Ctx>> | PageResult<Ctx>

/**
 * Контракт маршрута
 * Агностик к UI-фреймворку
 */
export interface RouteContract {
  path: string
  page: PageFunction<any, any>
}

