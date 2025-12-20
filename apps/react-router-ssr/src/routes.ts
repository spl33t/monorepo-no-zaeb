/**
 * Routes configuration using @monorepo/routes-ssr
 */

import {
  type PageFunction,
  defineRoute,
  createRoutesFactory,
} from '@monorepo/routes-ssr';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AppRootContext = {
  requestId: string;
  locale: 'ru' | 'en';
  session: {
    userId: string | null;
    role: 'user' | 'admin' | 'moderator' | null;
  } | null;
};

export type ProfileRouteContext = {
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

export type ProductRouteContext = {
  product: {
    id: string;
    slug: string;
    name: string;
    price: number;
    description: string;
  };
};

export type HomeRouteContext = {
  message: string;
};

// ============================================================================
// PAGE FUNCTIONS
// ============================================================================

/**
 * Home page function
 */
const HomePage: PageFunction<
  Record<string, never>,
  AppRootContext,
  HomeRouteContext
> = async (_params, rootContext) => {
  return {
    type: 'ok' as const,
    routeContext: {
      message: `Welcome! Locale: ${rootContext.locale}`,
    },
    seo: {
      title: 'Home',
      description: 'Welcome to our application',
      indexable: true,
    },
  };
};

/**
 * Profile page function
 */
const ProfilePage: PageFunction<
  { id: string },
  AppRootContext,
  ProfileRouteContext
> = async (params, rootContext) => {
  console.log('ProfilePage', params, rootContext);
  // Guard: check authentication
  if (!rootContext.session?.userId) {
    return {
      type: 'redirect',
   
    };
  }

  // Guard: check ownership
/*   if (rootContext.session.userId !== params.id) {
    return {
      type: 'redirect' as const,
      to: '/',
    };
  } */

  // Preload data (mock)
  const user = {
    id: params.id,
    name: 'John Doe',
    email: 'john@example.com',
  };

  const posts = [
    { id: '1', title: 'Post 1', content: 'Content 1' },
    { id: '2', title: 'Post 2', content: 'Content 2' },
  ];

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
      indexable: false,
      og: {
        title: `Profile: ${user.name}`,
        description: `View profile of ${user.name}`,
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
> = async (params, _rootContext) => {
  // Preload product data (mock)
  const product = {
    id: '1',
    slug: params.slug,
    name: 'Laptop',
    price: 999,
    description: 'A great laptop',
  };

  if (params.slug !== 'laptop') {
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
        type: 'product',
      },
      twitter: {
        card: 'summary_large_image',
        title: product.name,
        description: product.description,
      },
      canonical: `https://example.com/product/${product.slug}`,
    },
  };
};

// ============================================================================
// ROUTES FACTORY
// ============================================================================

export const createRoutes = createRoutesFactory<AppRootContext>({
  getRootContext: async () => {
    // In real app, this would get context from request
    // For now, return mock context
    return {
      requestId: crypto.randomUUID(),
      locale: 'ru',
      session: {
        userId: '123',
        role: 'user',
      },
    };
  },
});

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

export const routes = createRoutes({
  home: defineRoute('/', HomePage),
  profile: defineRoute('/profile/:id', ProfilePage),
  product: defineRoute('/product/:slug', ProductPage),
});

