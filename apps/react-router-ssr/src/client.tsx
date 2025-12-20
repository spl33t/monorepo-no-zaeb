/**
 * Client entry point for hydration
 */

import { hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { RouteContextProvider, ReactRouterAdapter } from '@monorepo/routes-ssr';
import { routes } from './routes';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

hydrateRoot(
  rootElement,
  <BrowserRouter>
    <RouteContextProvider>
      <ReactRouterAdapter
        routes={routes}
        getRootContext={async () => {
          // Get root context for client-side navigation
          // In real app, this would get context from auth/session
          return {
            requestId: crypto.randomUUID(),
            locale: (navigator.language?.includes('ru') ? 'ru' : 'en') as 'ru' | 'en',
            session: {
              userId: '123',
              role: 'user',
            },
          };
        }}
      />
      <App />
    </RouteContextProvider>
  </BrowserRouter>
);

