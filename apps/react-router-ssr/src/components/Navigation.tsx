import { Link, useLocation } from 'react-router-dom';
import { routes } from '../routes';

/**
 * Navigation component with links to all routes
 */
export function Navigation() {
  const location = useLocation();

  return (
    <nav style={{ marginBottom: '20px', padding: '10px', borderBottom: '1px solid #ccc' }}>
      <ul style={{ listStyle: 'none', display: 'flex', gap: '20px', margin: 0, padding: 0 }}>
        {routes._routes.map((route) => {
          const path = route.path;
          
          // Skip routes with params for navigation (or show with example params)
          if (path.includes(':')) {
            // For routes with params, show example links
            const examplePath = path
              .replace(':id', '7')
              .replace(':slug', 'laptop');
            return (
              <li key={path}>
                <Link
                  to={examplePath}
                  style={{
                    textDecoration: location.pathname === examplePath ? 'underline' : 'none',
                    color: location.pathname === examplePath ? 'blue' : 'inherit',
                  }}
                >
                  {path} ({examplePath})
                </Link>
              </li>
            );
          }
          
          return (
            <li key={path}>
              <Link
                to={path}
                style={{
                  textDecoration: location.pathname === path ? 'underline' : 'none',
                  color: location.pathname === path ? 'blue' : 'inherit',
                }}
              >
                {path}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

