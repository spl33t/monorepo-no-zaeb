import { Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { Product } from './pages/Product';
import { routes } from './routes';
import { Navigation } from './components/Navigation';
import { NotFoundPage } from '@monorepo/routes-ssr';
import { useEffect, useState } from 'react';

/**
 * App component - must be wrapped with Router (StaticRouter on server, BrowserRouter on client)
 */
export function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    localStorage.setItem('test', 'test');
  }, []);

  return (
    <div>
      <Navigation />
      <h1>Count: {count}</h1>
      <h2>Test</h2>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <Routes>
        {routes._mapPages({
          home: Home,
          profile: Profile,
          product: Product,
        }).map(({ key, path, component: Component }) => (
          <Route key={key} path={path} element={<Component />} />
        ))}
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
