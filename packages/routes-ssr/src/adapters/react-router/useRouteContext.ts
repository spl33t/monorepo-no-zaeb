import { useContext } from 'react';
import { RouteContextContext } from './RouteContextContext';

/**
 * Hook to access route context in components
 */
export function useRouteContext<T = unknown>(): T | null {
  const { context } = useContext(RouteContextContext);
  return (context as T) || null;
}



