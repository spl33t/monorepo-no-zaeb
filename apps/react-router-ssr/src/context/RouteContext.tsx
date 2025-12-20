/**
 * Route Context Provider для передачи данных страницы в React компоненты
 */

import { createContext, useContext, useState, ReactNode } from 'react';

type RouteContextValue = unknown;

const RouteContext = createContext<{
  context: RouteContextValue | null;
  setContext: (context: RouteContextValue | null) => void;
}>({
  context: null,
  setContext: () => {},
});

export function RouteContextProvider({
  children,
  initialContext,
}: {
  children: ReactNode;
  initialContext?: RouteContextValue | null;
}) {
  const [context, setContext] = useState<RouteContextValue | null>(
    initialContext ?? null
  );

  return (
    <RouteContext.Provider value={{ context, setContext }}>
      {children}
    </RouteContext.Provider>
  );
}

export function useRouteContext<T = unknown>(): T | null {
  const { context } = useContext(RouteContext);
  return (context as T) || null;
}

export function useSetRouteContext() {
  const { setContext } = useContext(RouteContext);
  return setContext;
}

