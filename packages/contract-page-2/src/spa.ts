// SPA Enhancement для contract-page-2
// Упрощенная версия: только обновление title при смене URL

import type { Contract, RequestContext } from './index';

// Функция для обновления title при смене URL в SPA
export function updateTitleOnNavigation<AppCtx>(contract: Contract<AppCtx, any>) {
  if (typeof window === 'undefined') {
    return; // Только для клиента
  }

  // Функция для обновления title на основе текущего URL
  const updateTitle = async () => {
    const url = window.location.pathname;
    const { page, params } = contract.matchRoute(url);

    if (!page) {
      // Если страница не найдена, устанавливаем дефолтный title
      document.title = 'App';
      return;
    }

    try {
      const runtimeCtx: RequestContext = {
        method: 'GET',
        url,
        headers: {},
        query: {},
      };
      
      // Получаем appContext если он есть
      let appContext: any = undefined;
      const contractWithGetAppContext = contract as any;
      if ('getAppContext' in contractWithGetAppContext && contractWithGetAppContext.getAppContext) {
        appContext = await contractWithGetAppContext.getAppContext(runtimeCtx);
      }

      // Вызываем page функцию для получения SEO данных
      const result = appContext !== undefined
        ? await (page.fn as any)({ appContext, params })
        : await (page.fn as any)({ params });

      // Обновляем title из SEO данных
      const title = (result as any)?.seo?.title;
      if (title) {
        document.title = title;
      }
    } catch (error) {
      // В случае ошибки оставляем текущий title или устанавливаем дефолтный
      console.error('Failed to update title:', error);
    }
  };

  // Обновляем title при первой загрузке
  updateTitle();

  // Обновляем title при изменении URL (popstate для браузерной навигации)
  window.addEventListener('popstate', updateTitle);

  // Перехватываем pushState и replaceState для обновления title при программной навигации
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;

  window.history.pushState = function(...args) {
    originalPushState.apply(window.history, args);
    updateTitle();
  };

  window.history.replaceState = function(...args) {
    originalReplaceState.apply(window.history, args);
    updateTitle();
  };

  // Возвращаем функцию для ручного обновления title
  return {
    updateTitle,
  };
}

