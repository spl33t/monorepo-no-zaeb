import { Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { Product } from './pages/Product';
import { Navigation } from './components/Navigation';
import { routes } from './routes';
import { useEffect, useState } from 'react';

function NotFoundPage() {
  return (
    <div>
      <h1>404 - Not Found</h1>
      <p>The page you are looking for does not exist.</p>
    </div>
  );
}

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
        {routes._mapToView({
          home: Home,
          profile: Profile,
          product: Product,
        }).map(({ key, path, Component }) => (
          <Route key={key} path={path} element={<Component />} />
        ))}
  
      </Routes>
    </div>
  );
}
