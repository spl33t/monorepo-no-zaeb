/**
 * @monorepo/page-contract
 * 
 * Контракт маршрута — единственный источник правды
 * 
 * PageFunction может вернуть:
 * - redirect
 * - notFound
 * - error
 * - ok с данными + SEO
 * 
 * Исполняется:
 * - на сервере (SSR)
 * - в браузере (SPA-навигация)
 * 
 * Агностик к UI-фреймворку
 * Поведение 100% идентично в SSR и SPA
 */

// Типы
export type {
  PageResult,
  PageInput,
  PageFunction,
  RouteContract,
  SeoDescriptor
} from './types'

// Runtime
export { runPage } from './runtime'

// Утилиты
export { extractParams, parseQuery } from './utils'

// Главная фабрика для инициализации (рекомендуемый способ)
export {
  createPageContract,
  type CreatePageContractOptions,
  type PageContract
} from './contract-factory'

// Фабрика routes (для прямого использования, если нужно)
export {
  createRoutes,
  type CreateRoutesOptions,
  type Routes,
  type RouteDefinition,
  type RoutesConfig,
  type CreateHandleRequestOptions,
  type ExtractRoutesContext
} from './factory'

// Фабрика page functions (для прямого использования, если нужно)
export {
  definePage,
  type PageHandlerWithContext,
  type PageHandlerWithoutContext,
  type DefinePageWithContextOptions
} from './page-factory'

// SSR адаптеры
export {
  handleSsrRequest,
  type SsrAdapterOptions
} from './adapters/ssr'

export {
  handleSsrRequestFetch,
  type SsrFetchAdapterOptions
} from './adapters/ssr-fetch'

// SPA адаптер
export {
  handleSpaNavigation,
  type SpaAdapterOptions
} from './adapters/spa'
