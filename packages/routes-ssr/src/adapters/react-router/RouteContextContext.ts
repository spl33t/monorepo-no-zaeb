import { createContext } from 'react';
import type { RouteContext } from '../../index';

export const RouteContextContext = createContext<{
  context: RouteContext | null;
  setContext: (context: RouteContext | null) => void;
}>({
  context: null,
  setContext: () => {},
});



