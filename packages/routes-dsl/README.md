# Routes DSL

Type-safe declarative routing DSL for SPA applications. Single source of truth for routes, redirects, SEO, and infrastructure metadata.

## Key Concepts

### Two-Step Initialization

1. **Create factory** with global context (user, roles, environment)
2. **Create routes** through the factory

```typescript
import { createRoutesFactory, $type } from '@monorepo/routes-dsl';

// Step 1: Create typed factory with SPA context shape
// Use $type for each context prop - type is automatically inferred
// spaContext is separate from SEO context - they should not be mixed
const createRoutes = createRoutesFactory({
  spaContext: {
    user: $type<User | null>(),
    permissions: $type<string[]>(),
    features: $type<{ premium: boolean; beta: boolean }>(),
  },
});

// Step 2: Define routes
const routes = createRoutes({
  home: {
    path: '/',
    seo: {
      title: 'Home',  // Static string
      description: 'Welcome to our app',  // Static string
    },
  },
  
  profile: {
    path: '/profile/:id',
    redirect: (params, context) => context.user === null ? '/login' : null,
    seo: {
      title: (params) => `Profile ${params.id}`,  // Function with params
      description: (params) => `View profile of user ${params.id}`,  // Function with params
    },
  },
  
  admin: {
    path: '/admin',
    redirect: (params, context) => {
      const user = context.user;
      if (user === null) return '/login';
      if (user.role !== 'admin') return '/';
      return null;
    },
  },
});
```

## Features

### ✅ Type-Safe URLs

```typescript
// TypeScript knows params!
routes.profile.url({ id: '123' }); // ✅ "/profile/123"
routes.profile.url({ id: '123', unknown: 'x' }); // ❌ Type error
```

### ✅ Context-Aware Redirects

```typescript
const routes = createRoutes({
  dashboard: {
    path: '/dashboard',
    redirect: (params, context) => {
      // context can contain any props you defined
      if (context.user === null) return '/login';
      if (!context.features.premium) return '/';
      return null; // No redirect - route is accessible
    },
  },
});

// Check redirect - if null, route is accessible
const redirect = routes.dashboard.redirect();
if (redirect) {
  // Redirect to redirect path
} else {
  // Route is accessible
}
```

### ✅ SEO Metadata

```typescript
const routes = createRoutes({
  // Static SEO (strings)
  home: {
    path: '/',
    seo: {
      title: 'Home',
      description: 'Welcome to our app',
    },
  },
  
  // Dynamic SEO (functions with params)
  product: {
    path: '/product/:slug',
    seo: {
      title: (params) => `Product: ${params.slug}`,
      description: (params) => `Buy ${params.slug} now`,
    },
  },
});

// Get SEO for current route
const seo = routes.product.seo({ slug: 'laptop' });
// { title: "Product: laptop", description: "Buy laptop now" }
```

### ✅ Sitemap Generation

```typescript
const sitemap = routes.sitemap();
// Generates sitemap entries for all routes
```

### ✅ SEO Manifest

```typescript
const manifest = routes.seoManifest();
// Generates SEO metadata for all routes
```

## API Reference

### `createRoutesFactory(config)`

Creates a typed factory for creating routes with context. Type is automatically inferred from `$type` assertions.

**Config:**
- `spaContext: Record<string, ReturnType<typeof $type<T>>>` - SPA context shape with `$type` assertions for each prop

**Example:**
```typescript
const createRoutes = createRoutesFactory({
  spaContext: {
    user: $type<User | null>(),
    permissions: $type<string[]>(),
    features: $type<{ premium: boolean; beta: boolean }>(),
  },
});
// Type is automatically inferred as:
// { user: User | null; permissions: string[]; features: { premium: boolean; beta: boolean } }
// 
// Note: spaContext is separate from SEO context - they should not be mixed
```

### Route Definition

```typescript
interface RouteDefinition {
  path: string;              // URL pattern: "/user/:id"
  name?: string;             // Route name (defaults to key)
  seo?: SEOConfig;          // SEO metadata configuration
  redirect?: string | RedirectFn;     // Redirect logic - string path or function (null = accessible)
  cache?: {                 // Cache control
    ttl?: number;
    tags?: string[];
  };
}
```

### Route Methods

```typescript
route.url(params?)           // Generate URL
route.seo(params?)          // Get SEO metadata
route.redirect(params?)     // Get redirect path (null = accessible)
```

## Examples

### Basic Usage

```typescript
import { createRoutesFactory, $type } from '@monorepo/routes-dsl';

type User = { id: string; role: 'user' | 'admin' };

// Create typed factory with SPA context shape using $type
// Type is automatically inferred from $type assertions
// spaContext is separate from SEO context
const createRoutes = createRoutesFactory({
  spaContext: {
    user: $type<User | null>(),
    permissions: $type<string[]>(),
  },
});

const routes = createRoutes({
  home: {
    path: '/',
    seo: {
      title: 'Home',  // Static string
      description: 'Welcome',  // Static string
    },
  },
  
  profile: {
    path: '/profile/:id',
    redirect: (params, context) => context.user === null ? '/login' : null,
    seo: {
      title: (params) => `Profile ${params.id}`,  // Function with params
      description: (params) => `View profile of user ${params.id}`,  // Function with params
    },
  },
  
  admin: {
    path: '/admin',
    redirect: (params, context) => {
      const user = context.user;
      if (user === null) return '/login';
      if (user.role !== 'admin') return '/';
      return null;
    },
  },
});

// Use routes
const profileUrl = routes.profile.url({ id: '123' });
const redirect = routes.admin.redirect();
const seo = routes.profile.seo({ id: '123' });
```

### Integration with React Router

```typescript
import { useRoutes } from 'react-router-dom';
import { routes } from './routes';

// Convert DSL routes to React Router config
const routerConfig = routes.all().map((route) => ({
  path: route.path,
  element: <RouteComponent route={route} />,
}));

function RouteComponent({ route }: { route: Route }) {
  // Check redirect - if not null, redirect to that path
  const redirect = route.redirect();
  if (redirect) {
    return <Navigate to={redirect} />;
  }
  
  // Use SEO
  const seo = route.seo();
  document.title = seo.title || '';
  
  return <YourComponent />;
}
```

### Sitemap Generation

```typescript
// Generate sitemap.xml
const sitemap = routes.sitemap();

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map(entry => `
  <url>
    <loc>${entry.url}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>
`).join('')}
</urlset>`;
```

## Architecture

```
┌─────────────────────────────────────┐
│   Routes DSL (Domain Model)        │
│   - Route definitions               │
│   - Redirect logic                  │
│   - SEO metadata                    │
│   - Context management              │
└─────────────────────────────────────┘
              │
              ├───> React Router (UI)
              ├───> Edge/SSR (SEO)
              ├───> Sitemap Generator
              └───> SEO Manifest
```

DSL is **above** the router, not a replacement. It provides:
- Single source of truth
- Type safety
- Context-aware logic
- Reusable across platforms

