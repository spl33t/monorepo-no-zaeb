import type { RouteContract, PageInput, PageViewInput, PageResult, PageResultType, SeoDescriptor } from '../types'
import { runPage } from '../runtime'

/**
 * Обновляет SEO мета-теги в браузере
 */
function updateSeoMetadata(seo: SeoDescriptor): void {
  if (typeof document === 'undefined') {
    // Не в браузере - ничего не делаем
    return;
  }

  // Обновляем title
  if (seo.title) {
    document.title = seo.title;
  }

  // Обновляем description
  if (seo.description) {
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', seo.description);
  }

  // Обновляем другие meta теги
  if (seo.meta) {
    Object.entries(seo.meta).forEach(([name, content]) => {
      // Определяем, это property (og:) или name
      const isProperty = name.startsWith('og:') || name.startsWith('twitter:');
      const attr = isProperty ? 'property' : 'name';
      const selector = isProperty 
        ? `meta[property="${name}"]` 
        : `meta[name="${name}"]`;
      
      let metaTag = document.querySelector(selector);
      if (!metaTag) {
        metaTag = document.createElement('meta');
        metaTag.setAttribute(attr, name);
        document.head.appendChild(metaTag);
      }
      metaTag.setAttribute('content', String(content));
    });
  }
}

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
 * Результат SPA навигации
 */
export interface SpaNavigationResult<Ctx = unknown> {
  ctx: Ctx | null
  pageInput: PageViewInput | null
  seo?: SeoDescriptor | null
}

/**
 * Обработчик SPA навигации
 * 
 * Интерпретирует результат PageFunction и выполняет соответствующие side-effects
 * 
 * @param route - Контракт маршрута
 * @param input - Входные данные
 * @param options - Опции адаптера
 * @returns Результат навигации с контекстом и PageViewInput (содержит resultType)
 */
export async function handleSpaNavigation<Ctx = unknown>(
  route: RouteContract,
  input: PageInput,
  options: SpaAdapterOptions
): Promise<SpaNavigationResult<Ctx>> {
  const result = await runPage(route.page, input)
  
  switch (result.type) {
    case 'redirect':
      options.navigate(result.to)
      return {
        ctx: null,
        pageInput: {
          ...input,
          resultType: 'redirect',
        },
        seo: null,
      }

    case 'not-found':
      // not-found обрабатывается самой страницей
      // Возвращаем контекст (или дефолтный объект) чтобы страница могла показать правильный UI
      // Если контекст не передан, используем дефолтный объект
      const notFoundCtx = result.ctx ?? { notFound: true };
      
      // Обновляем SEO метаданные если есть
      if (result.seo) {
        updateSeoMetadata(result.seo);
      }
      
      return {
        ctx: notFoundCtx as Ctx,
        pageInput: {
          ...input,
          resultType: 'not-found',
        },
        seo: result.seo ?? null,
      }

    case 'error':
      // В SPA можно показать error boundary или перенаправить на error page
      options.navigate('/error')
      return {
        ctx: null,
        pageInput: {
          ...input,
          resultType: 'error',
        },
        seo: null,
      }

    case 'ok':
      // Обновляем SEO метаданные в браузере
      if (result.seo) {
        updateSeoMetadata(result.seo);
      }
      
      return {
        ctx: result.ctx as Ctx,
        pageInput: {
          ...input,
          resultType: 'ok',
        },
        seo: result.seo ?? null,
      }
  }
}

