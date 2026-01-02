import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { contract } from '@monorepo/core';
import { updateTitleOnNavigation } from '@monorepo/contract-page-2';
import { HomePage, CharacterPage, EpisodesPage, EpisodePage } from './pages';
import { useEffect, useState } from 'react';

// Инициализируем обновление title при навигации
updateTitleOnNavigation(contract);

// Компонент для отображения appContext
function AppContextDisplay() {
  const location = useLocation();
  const [appContext, setAppContext] = useState<any>(undefined);

  useEffect(() => {
    const loadAppContext = async () => {
        const runtimeCtx = { url: location.pathname };
        const ctx = await contract.getAppContext(runtimeCtx);
        setAppContext(ctx);
    };
    
    loadAppContext();
  }, [location.pathname]);

  if (!appContext) return null;

  return (
    <div style={{ marginTop: '8px', color: '#666', fontSize: '14px' }}>
      User: {appContext.userId} | Session: {appContext.sessionId} | URL: {appContext.url}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ marginBottom: '24px', borderBottom: '1px solid #eee', paddingBottom: '16px' }}>
          <nav style={{ display: 'flex', gap: '16px' }}>
            <Link to="/">Characters</Link>
            <Link to="/episodes">Episodes</Link>
          </nav>
          <AppContextDisplay />
        </header>
        
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/character/:id" element={<CharacterPage />} />
            <Route path="/episodes" element={<EpisodesPage />} />
            <Route path="/episode/:id" element={<EpisodePage />} />
            <Route path="*" element={<div>404 - Page Not Found</div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
