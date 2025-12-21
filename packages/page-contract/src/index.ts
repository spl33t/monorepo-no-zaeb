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
  PageViewInput,
  PageResultType,
  PageFunction,
  RouteContract,
  SeoDescriptor
} from './types'

// Runtime
export { runPage } from './runtime'

// Утилиты
export { extractParams, parseQuery } from './utils'
export { generateMetaTags, generateRouteContextScript } from './utils/seo'

// Главная фабрика для инициализации (рекомендуемый способ)
export {
  createPageContract,
  type CreatePageContractOptions,
  type PageContractFactory
} from './contract-factory'

// Фабрика routes (используется внутри createPageContract, но экспортируем для прямого использования)
export {
  createRoutes,
  type CreateRoutesOptions,
  type Routes,
  type RouteDefinition,
  type RoutesConfig,
  type CreateHandleRequestOptions,
  type ExtractRoutesContext
} from './factory'

// Фабрика page functions (используется внутри createPageContract, но экспортируем для прямого использования)
export {
  definePage,
  type PageHandlerWithContext,
  type PageHandlerWithoutContext,
  type DefinePageWithContextOptions,
  type PageContract
} from './page-factory'

// SSR адаптеры
// handleSsrRequestFetch используется внутри createHandleRequest
// Экспортируем для случаев, когда нужен прямой доступ к адаптеру
export {
  handleSsrRequestFetch,
  type SsrFetchAdapterOptions
} from './adapters/ssr-fetch'

// SPA адаптер
export {
  handleSpaNavigation,
  type SpaAdapterOptions
} from './adapters/spa'
