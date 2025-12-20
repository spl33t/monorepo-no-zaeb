/**
 * Default error page components for SEO-friendly HTTP status codes
 * These are React components, but the core library is framework-agnostic
 */

/**
 * 401 Unauthorized - Authentication required
 */
export function UnauthorizedPage() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>401</h1>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Unauthorized</h2>
      <p style={{ color: '#666' }}>
        Authentication is required to access this page.
      </p>
    </div>
  );
}

/**
 * 403 Forbidden - Access denied
 */
export function ForbiddenPage() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>403</h1>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Forbidden</h2>
      <p style={{ color: '#666' }}>
        You don't have permission to access this page.
      </p>
    </div>
  );
}

/**
 * 404 Not Found - Page doesn't exist
 */
export function NotFoundPage() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>404</h1>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Page Not Found</h2>
      <p style={{ color: '#666' }}>
        The page you are looking for does not exist.
      </p>
    </div>
  );
}

/**
 * 410 Gone - Page was removed
 */
export function GonePage() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>410</h1>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Gone</h2>
      <p style={{ color: '#666' }}>
        This page has been removed and is no longer available.
      </p>
    </div>
  );
}

/**
 * 451 Unavailable For Legal Reasons
 */
export function UnavailableForLegalReasonsPage() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>451</h1>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Unavailable For Legal Reasons</h2>
      <p style={{ color: '#666' }}>
        This content is not available due to legal restrictions.
      </p>
    </div>
  );
}


