/**
 * React Router adapter for @monorepo/routes-ssr
 * 
 * This adapter provides React-specific components and hooks for using
 * routes-ssr with React Router.
 * 
 * @example
 * ```tsx
 * import { BrowserRouter } from 'react-router-dom';
 * import { RouteContextProvider, ReactRouterAdapter, useRouteContext } from '@monorepo/routes-ssr/adapters/react-router';
 * 
 * function App() {
 *   return (
 *     <BrowserRouter>
 *       <RouteContextProvider>
 *         <ReactRouterAdapter routes={routes} getRootContext={getRootContext} />
 *         <Routes>
 *           {/* Your routes *\/}
 *         </Routes>
 *       </RouteContextProvider>
 *     </BrowserRouter>
 *   );
 * }
 * ```
 */

export { RouteContextContext } from './RouteContextContext';
export { RouteContextProvider } from './RouteContextProvider';
export { useRouteContext } from './useRouteContext';
export { ReactRouterAdapter } from './ReactRouterAdapter';
export {
  NotFoundPage,
  UnauthorizedPage,
  ForbiddenPage,
  GonePage,
  UnavailableForLegalReasonsPage,
} from './ErrorPages';

