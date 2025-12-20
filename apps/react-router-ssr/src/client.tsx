/**
 * Client entry point for hydration
 */

import { hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { RouteContextProvider } from './context/RouteContext';
import { ReactRouterAdapter } from './adapters/ReactRouterAdapter';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

// Получаем initial context из window (инжектится сервером)
const initialContext =
  typeof window !== 'undefined' && (window as any).__ROUTE_CONTEXT__
    ? (window as any).__ROUTE_CONTEXT__
    : null;

hydrateRoot(
  rootElement,
  <BrowserRouter>
    <RouteContextProvider initialContext={initialContext}>
      <ReactRouterAdapter />
      <App />
    </RouteContextProvider>
  </BrowserRouter>
);
