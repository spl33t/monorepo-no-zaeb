import type { RouteContract, PageInput, PageResult } from '../types'
import { runPage } from '../runtime'

/**
 * Опции для SPA адаптера
 */
export interface SpaAdapterOptions {
  /**
   * Функция для навигации (например, navigate из React Router)
   */
  navigate: (to: string) => void
  
  /**
   * Путь для 404 страницы
   */
  notFoundPath?: string
}

/**
 * Обработчик SPA навигации
 * 
 * Интерпретирует результат PageFunction и выполняет соответствующие side-effects
 * 
 * @param route - Контракт маршрута
 * @param input - Входные данные
 * @param options - Опции адаптера
 * @returns Контекст страницы или null (если был редирект/404)
 */
export async function handleSpaNavigation<Ctx = unknown>(
  route: RouteContract,
  input: PageInput,
  options: SpaAdapterOptions
): Promise<Ctx | null> {
  const result = await runPage(route.page, input)
  
  switch (result.type) {
    case 'redirect':
      options.navigate(result.to)
      return null

    case 'not-found':
      options.navigate(options.notFoundPath || '/404')
      return null

    case 'error':
      // В SPA можно показать error boundary или перенаправить на error page
      options.navigate('/error')
      return null

    case 'ok':
      // Обновляем SEO метаданные в браузере
      if (result.seo) {
        if (result.seo.title) {
          document.title = result.seo.title
        }
        
        if (result.seo.description) {
          let metaDescription = document.querySelector('meta[name="description"]')
          if (!metaDescription) {
            metaDescription = document.createElement('meta')
            metaDescription.setAttribute('name', 'description')
            document.head.appendChild(metaDescription)
          }
          metaDescription.setAttribute('content', result.seo.description)
        }
        
        // Обновляем другие meta теги
        if (result.seo.meta) {
          Object.entries(result.seo.meta).forEach(([name, content]) => {
            let metaTag = document.querySelector(`meta[name="${name}"]`)
            if (!metaTag) {
              metaTag = document.createElement('meta')
              metaTag.setAttribute('name', name)
              document.head.appendChild(metaTag)
            }
            metaTag.setAttribute('content', String(content))
          })
        }
      }
      
      return result.ctx as Ctx
  }
}

