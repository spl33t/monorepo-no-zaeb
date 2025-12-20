/**
 * React Router Adapter для SPA навигации
 * Использует handleSpaNavigation из @monorepo/page-contract
 */

import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { handleSpaNavigation } from '@monorepo/page-contract';
import { routes } from '../routes';
import { useSetRouteContext } from '../context/RouteContext';

/**
 * Adapter component that executes page functions on route changes
 * Should be placed inside RouteContextProvider and BrowserRouter
 */
export function ReactRouterAdapter() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setContext = useSetRouteContext();

  useEffect(() => {
    const runPage = async () => {
      const match = routes._match(location.pathname);

      // No route match - set context to null and let React Router handle 404
      if (!match) {
        setContext(null);
        return;
      }

      // Подготавливаем PageInput
      const input = {
        params: match.params,
        query: Object.fromEntries(searchParams.entries()),
        headers: {
          'accept-language': navigator.language || 'en',
          'x-user-id': localStorage.getItem('userId') || '',
          'x-user-role': localStorage.getItem('userRole') || '',
        },
        request: {
          url: location.pathname + location.search,
          method: 'GET',
        },
      };

      // Используем handleSpaNavigation
      const ctx = await handleSpaNavigation(match.route, input, {
        navigate: (to: string) => {
          navigate(to, { replace: true });
        },
        notFoundPath: '/404',
      });

      // Обновляем контекст
      setContext(ctx);
    };

    runPage();
  }, [location.pathname, location.search, navigate, setContext]);

  return null;
}

