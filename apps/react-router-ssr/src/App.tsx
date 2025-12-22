/**
 * Определение приложения
 */

import { useState, useEffect, createElement } from 'react';
import { enhanceContractWithSPA, navigateTo } from '@monorepo/contract-page-2';
import { contractWithCtx } from './routes';

// Импорт страниц для регистрации компонентов
import './pages';

// Создаём app - будет использоваться и на сервере и на клиенте
export const app = enhanceContractWithSPA(contractWithCtx).defineApp({
  React: { useState, useEffect, createElement },
  renderApp: ({ router, appContext }: { router: any; appContext?: any }) => (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '24px', borderBottom: '1px solid #eee', paddingBottom: '16px' }}>
        <nav style={{ display: 'flex', gap: '16px' }}>
          <a href="/" onClick={(e) => { e.preventDefault(); navigateTo('/'); }}>Characters</a>
          <a href="/episodes" onClick={(e) => { e.preventDefault(); navigateTo('/episodes'); }}>Episodes</a>
        </nav>
        {appContext && (
          <div style={{ marginTop: '8px', color: '#666', fontSize: '14px' }}>
            User: {appContext.userId} | Session: {appContext.sessionId} | URL: {appContext.url}
          </div>
        )}
      </header>
      <main>{router}</main>
    </div>
  ),
  notFound: () => createElement('div', null, '404 - Page Not Found'),
  loading: () => createElement('div', null, 'Loading...'),
});

