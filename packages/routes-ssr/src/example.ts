/**
 * Example usage of @monorepo/routes-ssr
 */

import {
  type RouteDefinition,
  type RootContext,
  type RouteContext,
  type PageFunction,
  defineRoute,
  createRoutesFactory,
  getRouteContextFromWindow,
  pageResultToResponse,
} from './index';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type AppRootContext = {
  requestId: string;
  locale: 'ru' | 'en';
  session: {
    userId: string | null;
    role: 'user' | 'admin' | 'moderator' | null;
  } | null;
};

type ProfileRouteContext = {
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  posts: Array<{
    id: string;
    title: string;
    content: string;
  }>;
};

type ProductRouteContext = {
  product: {
    id: string;
    slug: string;
    name: string;
    price: number;
    description: string;
  };
};

// ============================================================================
// PAGE FUNCTIONS
// ============================================================================

/**
 * Profile page function
 */
const ProfilePage: PageFunction<
  { id: string },
  AppRootContext,
  ProfileRouteContext
> = async (params, rootContext) => {
  // Guard: check authentication
  if (!rootContext.session?.userId) {
    return {
      type: 'redirect' as const,
      to: '/login',
    };
  }
  
  // Guard: check ownership
  if (rootContext.session.userId !== params.id) {
    return {
      type: 'redirect' as const,
      to: '/',
    };
  }
  
  // Preload data
  const [user, posts] = await Promise.all([
    fetchUser(params.id),
    fetchUserPosts(params.id),
  ]);
  
  return {
    type: 'ok' as const,
    routeContext: {
      userId: params.id,
      user,
      posts,
    },
    seo: {
      title: `Profile: ${user.name}`,
      description: `View profile of ${user.name}`,
      indexable: false, // Private profile
      og: {
        title: `Profile: ${user.name}`,
        description: `View profile of ${user.name}`,
        image: `https://example.com/avatars/${user.id}.jpg`,
        type: 'profile',
      },
    },
  };
};

/**
 * Product page function
 */
const ProductPage: PageFunction<
  { slug: string },
  AppRootContext,
  ProductRouteContext
> = async (params, rootContext) => {
  // Preload product data
  const product = await fetchProduct(params.slug);
  
  if (!product) {
    return {
      type: 'notFound' as const,
    };
  }
  
  return {
    type: 'ok' as const,
    routeContext: {
      product,
    },
    seo: {
      title: `Product: ${product.name}`,
      description: product.description,
      indexable: true,
      og: {
        title: product.name,
        description: product.description,
        image: `https://example.com/products/${product.slug}.jpg`,
        type: 'product',
      },
      twitter: {
        card: 'summary_large_image',
        title: product.name,
        description: product.description,
        image: `https://example.com/products/${product.slug}.jpg`,
      },
      canonical: `https://example.com/product/${product.slug}`,
    },
  };
};

// ============================================================================
// ROUTES FACTORY
// ============================================================================

const createRoutes = createRoutesFactory<AppRootContext>({
  getRootContext: async () => {
    // In real app, this would get context from request
    return {
      requestId: crypto.randomUUID(),
      locale: 'ru',
      session: await getSessionFromCookie(''),
    };
  },
});

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

export const routes = createRoutes({
  profile: defineRoute('/profile/:id', ProfilePage),
  product: defineRoute('/product/:slug', ProductPage),
});

// ============================================================================
// EDGE HANDLER EXAMPLE
// ============================================================================

/**
 * Example Edge handler (Cloudflare Workers, Vercel Edge, etc.)
 */
export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // 1. Match route
  const match = routes._match(pathname);
  if (!match) {
    return new Response('Not Found', { status: 404 });
  }
  
  // 2. Initialize rootContext
  const rootContext: AppRootContext = {
    requestId: crypto.randomUUID(),
    locale: (request.headers.get('Accept-Language')?.includes('ru') ? 'ru' : 'en') as 'ru' | 'en',
    session: await getSessionFromCookie(request.headers.get('Cookie') || ''),
  };
  
  // 3. Call pageFunction
  const pageResult = await match.route.page(match.params, rootContext);
  
  // 4. Convert PageResult to Response (handles redirects, errors, and HTML rendering)
  return pageResultToResponse(pageResult, {
    renderHTML: (routeContext) => {
      // In real app, this would render React/Vue/etc.
      // const html = renderToString(<App routeContext={routeContext} />);
      return `<div id="app"><!-- React rendered content --></div>`;
    },
    baseHTML: `
<!DOCTYPE html>
<html lang="${rootContext.locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  {{SEO}}
  {{ROUTE_CONTEXT}}
</head>
<body>
  <div id="app">{{CONTENT}}</div>
  <script src="/assets/client.js"></script>
</body>
</html>
    `.trim(),
  });
}

// ============================================================================
// CLIENT-SIDE HYDRATION EXAMPLE
// ============================================================================

/**
 * Example client-side hydration (React)
 */
export function hydrateApp() {
  // Get routeContext from window
  const routeContext = getRouteContextFromWindow<ProfileRouteContext | ProductRouteContext>();
  
  if (!routeContext) {
    console.error('Route context not found');
    return;
  }
  
  // Hydrate React app
  // hydrateRoot(
  //   document.getElementById('app')!,
  //   <App routeContext={routeContext} />
  // );
  
  console.log('App hydrated with routeContext:', routeContext);
}

// ============================================================================
// MOCK FUNCTIONS
// ============================================================================

async function fetchUser(id: string): Promise<ProfileRouteContext['user']> {
  // Mock implementation
  return {
    id,
    name: 'John Doe',
    email: 'john@example.com',
  };
}

async function fetchUserPosts(userId: string): Promise<ProfileRouteContext['posts']> {
  // Mock implementation
  return [
    { id: '1', title: 'Post 1', content: 'Content 1' },
    { id: '2', title: 'Post 2', content: 'Content 2' },
  ];
}

async function fetchProduct(slug: string): Promise<ProductRouteContext['product'] | null> {
  // Mock implementation
  if (slug === 'laptop') {
    return {
      id: '1',
      slug: 'laptop',
      name: 'Laptop',
      price: 999,
      description: 'A great laptop',
    };
  }
  return null;
}

async function getSessionFromCookie(cookie: string): Promise<AppRootContext['session']> {
  // Mock implementation
  return {
    userId: '123',
    role: 'user',
  };
}

