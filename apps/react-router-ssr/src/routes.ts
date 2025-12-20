/**
 * Routes configuration using @monorepo/page-contract
 */

import type { PageFunction, PageInput } from '@monorepo/page-contract';
import { createRoutes } from '@monorepo/page-contract';

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
// HELPER: Get root context from PageInput
// ============================================================================

function getRootContextFromInput(input: PageInput): AppRootContext {
  // В реальном приложении это будет извлекаться из headers/cookies
  // Для примера используем заглушку
  const locale = input.headers?.['accept-language']?.includes('ru')
    ? 'ru'
    : 'en';

  return {
    requestId: crypto.randomUUID(),
    locale: locale as 'ru' | 'en',
    session: {
      userId: input.headers?.['x-user-id'] || null,
      role: (input.headers?.['x-user-role'] as any) || null,
    },
  };
}

// ============================================================================
// PAGE FUNCTIONS
// ============================================================================

/**
 * Home page function
 */
const HomePage: PageFunction<Record<string, never>, HomeRouteContext> = async (
  input
) => {
  const rootContext = getRootContextFromInput(input);

  return {
    type: 'ok',
    ctx: {
      message: `Welcome! Locale: ${rootContext.locale}`,
    },
    seo: {
      title: 'Home',
      description: 'Welcome to our application',
      meta: {
        'og:title': 'Home',
        'og:description': 'Welcome to our application',
      },
    },
  };
};

/**
 * Profile page function
 */
const ProfilePage: PageFunction<{ id: string }, ProfileRouteContext> = async (
  input
) => {
  const rootContext = getRootContextFromInput(input);

  // Guard: check authentication
  if (!rootContext.session?.userId) {
    return {
      type: 'redirect',
      to: '/login',
      status: 302,
    };
  }

  // Preload data (mock)
  const user = {
    id: input.params.id,
    name: 'John Doe',
    email: 'john@example.com',
  };

  const posts = [
    { id: '1', title: 'Post 1', content: 'Content 1' },
    { id: '2', title: 'Post 2', content: 'Content 2' },
  ];

  return {
    type: 'ok',
    ctx: {
      userId: input.params.id,
      user,
      posts,
    },
    seo: {
      title: `Profile: ${user.name}`,
      description: `View profile of ${user.name}`,
      meta: {
        'og:title': `Profile: ${user.name}`,
        'og:description': `View profile of ${user.name}`,
        'og:type': 'profile',
      },
    },
  };
};

/**
 * Product page function
 */
const ProductPage: PageFunction<{ slug: string }, ProductRouteContext> =
  async (input) => {
    // Preload product data (mock)
    const product = {
      id: '1',
      slug: input.params.slug,
      name: 'Laptop',
      price: 999,
      description: 'A great laptop',
    };

    if (input.params.slug !== 'laptop') {
      return {
        type: 'not-found',
      };
    }

    return {
      type: 'ok',
      ctx: {
        product,
      },
      seo: {
        title: `Product: ${product.name}`,
        description: product.description,
        meta: {
          'og:title': product.name,
          'og:description': product.description,
          'og:type': 'product',
          'twitter:card': 'summary_large_image',
          'twitter:title': product.name,
          'twitter:description': product.description,
        },
      },
    };
  };

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

export const routes = createRoutes<AppRootContext>({
  appContext: getRootContextFromInput,
  routes: {
    home: {
      path: '/',
      page: HomePage,
    },
    profile: {
      path: '/profile/:id',
      page: ProfilePage,
    },
    product: {
      path: '/product/:slug',
      page: ProductPage,
    },
  },
});
