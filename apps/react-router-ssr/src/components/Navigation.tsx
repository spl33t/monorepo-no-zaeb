import { Link, useLocation } from 'react-router-dom';
import { routes } from '../routes';

/**
 * Navigation component with links to all routes
 */
export function Navigation() {
  const location = useLocation();
  const links = routes._getLinks();

  return (
    <nav style={{ marginBottom: '20px', padding: '10px', borderBottom: '1px solid #ccc' }}>
      <ul style={{ listStyle: 'none', display: 'flex', gap: '20px', margin: 0, padding: 0 }}>
        {links.map(({ key, path }) => {
          // Skip routes with params for navigation (or show with example params)
          if (path.includes(':')) {
            // For routes with params, show example links
            const examplePath = path
              .replace(':id', '7')
              .replace(':slug', 'laptop');
            return (
              <li key={key}>
                <Link
                  to={examplePath}
                  style={{
                    textDecoration: location.pathname === examplePath ? 'underline' : 'none',
                    color: location.pathname === examplePath ? 'blue' : 'inherit',
                  }}
                >
                  {key} ({examplePath})
                </Link>
              </li>
            );
          }
          
          return (
            <li key={key}>
              <Link
                to={path}
                style={{
                  textDecoration: location.pathname === path ? 'underline' : 'none',
                  color: location.pathname === path ? 'blue' : 'inherit',
                }}
              >
                {key}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

