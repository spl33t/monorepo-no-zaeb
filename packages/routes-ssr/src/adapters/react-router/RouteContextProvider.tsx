import { useState } from 'react';
import { RouteContextContext } from './RouteContextContext';
import { getRouteContextFromWindow } from '../../index';
import type { RouteContext } from '../../index';

interface RouteContextProviderProps {
  children: React.ReactNode;
  initialContext?: RouteContext | null;
}

/**
 * Provider for route context
 * Simple provider that only stores and provides context
 * Navigation logic is handled by router adapters
 */
export function RouteContextProvider({
  children,
  initialContext,
}: RouteContextProviderProps) {
  // On client, get context from window for hydration
  // On server, use initialContext
  const getInitialContext = (): RouteContext | null => {
    if (typeof window !== 'undefined') {
      const windowContext = getRouteContextFromWindow();
      return windowContext || initialContext || null;
    }
    return initialContext || null;
  };

  const [context, setContext] = useState<RouteContext | null>(getInitialContext);

  return (
    <RouteContextContext.Provider value={{ context, setContext }}>
      {children}
    </RouteContextContext.Provider>
  );
}



