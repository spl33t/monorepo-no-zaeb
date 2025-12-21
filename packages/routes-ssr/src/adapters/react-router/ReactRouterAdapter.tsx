/**
 * React Router adapter for routes-ssr
 * Handles navigation and executes page functions
 */
import { useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RouteContextContext } from './RouteContextContext';
import type { RootContext, PageFunction, RouteParams } from '../../index';

interface ReactRouterAdapterProps {
  routes: {
    _match: (url: string) => {
      route: { page: PageFunction<any, any, any> };
      params: RouteParams;
    } | null;
  };
  getRootContext: () => RootContext | Promise<RootContext>;
}

/**
 * Adapter component that executes page functions on route changes
 * Should be placed inside RouteContextProvider and BrowserRouter
 * 
 * This adapter:
 * - Executes page functions on route changes (SPA navigation)
 * - Handles redirects from page functions
 * - Updates route context for components
 * - Works seamlessly with SSR (uses initial context from window)
 */
export function ReactRouterAdapter({
  routes,
  getRootContext,
}: ReactRouterAdapterProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setContext } = useContext(RouteContextContext);

  useEffect(() => {
    const runPage = async () => {
      const match = routes._match(location.pathname);
      
      // No route match - set context to null and let React Router handle 404
      // This happens when:
      // 1. User navigates to a route that doesn't exist in our routes
      // 2. After SSR redirect to a page that is not defined in routes (e.g., /login)
      // In both cases, context will be null, which is expected behavior
      if (!match) {
        setContext(null);
        return;
      }

      try {
        const rootContext = await getRootContext();
        const result = await match.route.page(match.params, rootContext);

        switch (result.type) {
          case 'redirect':
            // For redirects, navigate immediately
            // The new route will be handled by next effect run when location.pathname changes
            // If the redirect target is not in routes, context will be null (handled above)
            navigate(result.to, { replace: true });
            return;

          case 'notFound':
            setContext(null);
            if (location.pathname !== '/404') {
              navigate('/404', { replace: true });
            }
            return;

          case 'gone':
            setContext(null);
            if (location.pathname !== '/410') {
              navigate('/410', { replace: true });
            }
            return;

          case 'forbidden':
            setContext(null);
            if (location.pathname !== '/403') {
              navigate('/403', { replace: true });
            }
            return;

          case 'unauthorized':
            setContext(null);
            if (location.pathname !== '/401') {
              navigate('/401', { replace: true });
            }
            return;

          case 'unavailableForLegalReasons':
            setContext(null);
            if (location.pathname !== '/451') {
              navigate('/451', { replace: true });
            }
            return;

          case 'ok':
            // Update window.__ROUTE_CONTEXT__ for consistency
            if (typeof window !== 'undefined') {
              (window as any).__ROUTE_CONTEXT__ = result.routeContext;
            }
            // Set context - this will trigger re-render of components using useRouteContext
            setContext(result.routeContext);
            return;
        }
      } catch (error) {
        console.error('Failed to execute page function:', error);
        setContext(null);
      }
    };

    runPage();
  }, [location.pathname, routes, getRootContext, navigate, setContext]);

  return null;
}



