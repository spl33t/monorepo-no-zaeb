/**
 * Example usage of Routes DSL
 * This file demonstrates how to use the DSL in a real application
 */

import {
    createRoutesFactory,
    $type,
} from './index';

// ============================================================================
// TYPES
// ============================================================================

type User = {
    id: string;
    email: string;
    role: 'user' | 'admin' | 'moderator';
    subscription?: 'free' | 'premium';
};

// ============================================================================
// SETUP FACTORY
// ============================================================================

// Create routes factory with SPA context shape using $type assertions
// Type is automatically inferred from $type assertions
// spaContext is separate from SEO context - they should not be mixed
const createRoutes = createRoutesFactory({
    spaContext: {
        user: $type<User | null>(),
        permissions: $type<string[]>(),
        features: $type<{
            premium: boolean;
            beta: boolean;
        }>(),
    },
});

// ============================================================================
// DEFINE ROUTES
// ============================================================================

export const routes = createRoutes({
    // Public routes
    home: {
        path: '/',
        seo: {
            title: 'Home',
            description: 'Welcome to our application',
        },
    },

    about: {
        path: '/about',
        seo: {
            title: 'About Us',
            description: 'Learn more about our company',
        },
    },

  // Authentication routes
  login: {
    path: '/login',
    guard: (params, context) => context.user !== null ? '/' : true, // Redirect if already logged in
    seo: {
      title: 'Login',
      description: 'Sign in to your account',
    },
  },

  register: {
    path: '/register',
    guard: (params, context) => context.user !== null ? '/' : true, // Redirect if already logged in
    seo: {
      title: 'Register',
      description: 'Create a new account',
    },
  },

  // Protected routes - redirect to login if not authenticated
  dashboard: {
    path: '/dashboard',
    guard: (params, context) => context.user === null ? '/login' : true,
    seo: {
      title: 'Dashboard',
      description: 'Your personal dashboard',
    },
  },

  profile: {
    path: '/profile/:id',
    guard: (params, context) => context.user === null ? '/login' : true,
    seo: {
      title: (params) => `Profile ${params.id}`,
      description: (params) => `View profile of user ${params.id}`,
    },
  },

  // Role-based routes - redirect if user doesn't have required role
  admin: {
    path: '/admin',
    guard: (params, context) => {
      const user = context.user;
      if (user === null) return '/login';
      if (user.role !== 'admin') return '/';
      return true;
    },
    seo: {
      title: 'Admin Panel',
      description: 'Administration dashboard',
    },
  },

  moderation: {
    path: '/moderation',
    guard: (params, context) => {
      const user = context.user;
      if (user === null) return '/login';
      if (user.role !== 'admin' && user.role !== 'moderator') return '/';
      return true;
    },
    seo: {
      title: 'Moderation',
      description: 'Content moderation panel',
    },
  },

  // Premium features - redirect if feature is not available
  premium: {
    path: '/premium',
    guard: (params, context) => {
      // Can use any props from context, not just user
      return context.features.premium ? true : '/';
    },
    seo: {
      title: 'Premium Features',
      description: 'Exclusive premium features',
    },
  },

  // Beta features - redirect if feature is not available or user doesn't have permission
  beta: {
    path: '/beta',
    guard: (params, context) => {
      // Can check permissions, features, or any other context props
      if (!context.features.beta || !context.permissions.includes('beta_access')) {
        return '/';
      }
      return true;
    },
    seo: {
      title: 'Beta Features',
      description: 'Beta features for testing',
    },
  },

    // Product routes with params
    product: {
        path: '/product/:slug',
        seo: {
            title: (params) => `Product: ${params.slug}`,
            description: (params) => `Buy ${params.slug} - Best prices guaranteed`,
            og: {
                title: (params) => `Product: ${params.slug}`,
                description: (params) => `Buy ${params.slug} - Best prices guaranteed`,
                image: (params) => `https://example.com/images/products/${params.slug}.jpg`,
                url: (params) => `https://example.com/product/${params.slug}`,
                type: 'product',
            },
            twitter: {
                card: 'summary_large_image',
                title: (params) => `Product: ${params.slug}`,
                description: (params) => `Buy ${params.slug} - Best prices guaranteed`,
                image: (params) => `https://example.com/images/products/${params.slug}.jpg`,
            },
            canonical: (params) => `https://example.com/product/${params.slug}`,
        },
        cache: {
            ttl: 3600,
            tags: ['products'],
        },
    },

    productList: {
        path: '/products/:category?',
        seo: {
            title: (params) => params.category
                ? `Products: ${params.category}`
                : 'All Products',
            description: (params) => `Browse our ${params.category || 'products'}`,
        },
    },

    // Blog routes
    blog: {
        path: '/blog',
        seo: {
            title: 'Blog',
            description: 'Latest articles and news',
        },
    },

    blogPost: {
        path: '/blog/:slug',
        seo: {
            title: (params) => `Blog: ${params.slug}`,
            description: (params) => `Read article: ${params.slug}`,
            og: {
                type: 'article',
                image: (params) => `https://example.com/images/blog/${params.slug}.jpg`,
                url: (params) => `https://example.com/blog/${params.slug}`,
            },
            twitter: {
                card: 'summary_large_image',
                image: (params) => `https://example.com/images/blog/${params.slug}.jpg`,
            },
            canonical: (params) => `https://example.com/blog/${params.slug}`,
        },
        cache: {
            ttl: 7200,
            tags: ['blog'],
        },
    },
});

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

// Generate URLs
// @ts-expect-error - Example usage, types are inferred correctly in real usage
const profileUrl = routes.profile.url({ id: '123' });
// "/profile/123"

// @ts-expect-error - Example usage
const productUrl = routes.product.url({ slug: 'laptop' });
// "/product/laptop"

// @ts-expect-error - Example usage
const productsUrl = routes.productList.url({ category: 'electronics' });
// "/products/electronics"

// Check guard - if string, redirect; if true, allow; if false, prevent
const adminGuard = routes.admin.guard();
if (adminGuard) {
    // In real app, you'd await this in async function
    // const guardResult = await adminGuard({}, context);
    // if (typeof guardResult === 'string') {
    //   console.log(`Redirecting to: ${guardResult}`);
    // } else if (guardResult === false) {
    //   console.log('Access denied');
    // } else {
    //   console.log('User can access admin panel');
    // }
}

// Get SEO metadata
// @ts-expect-error - Example usage
const seo = routes.product.seo({ slug: 'laptop' })
// {
//   title: "Product: laptop",
//   description: "Buy laptop - Best prices guaranteed",
//   og: {
//     title: "Product: laptop",
//     description: "Buy laptop - Best prices guaranteed",
//     image: "https://example.com/images/products/laptop.jpg",
//     url: "https://example.com/product/laptop",
//     type: "product"
//   },
//   twitter: {
//     card: "summary_large_image",
//     title: "Product: laptop",
//     description: "Buy laptop - Best prices guaranteed",
//     image: "https://example.com/images/products/laptop.jpg"
//   },
//   canonical: "https://example.com/product/laptop"
// }

// Check guard
const loginGuard = routes.login.guard();
if (loginGuard) {
  // In real app, you'd await this in async function
  // const guardResult = await loginGuard({}, context);
  // if (typeof guardResult === 'string') {
  //   console.log(`Redirecting to: ${guardResult}`);
  // }
}

// Generate sitemap
const sitemap = routes._sitemap();
// Array of sitemap entries

// Generate SEO manifest
const manifest = routes._seoManifest();
// Array of SEO metadata for all routes

// ============================================================================
// INTEGRATION WITH REACT ROUTER
// ============================================================================

/**
 * Example: Convert DSL routes to React Router config
 * 
 * Note: This is pseudocode showing integration pattern.
 * In real app, you'd use React Router's createBrowserRouter or similar.
 */
/*
export function createRouterConfig() {
  return routes.all().map((route) => ({
    path: route.path,
    element: <RouteWrapper route={route} />,
  }));
}
*/

/**
 * Example: Route wrapper component
 * 
 * Note: This is pseudocode showing integration pattern.
 * In real app, you'd import React hooks and components.
 */
/*
function RouteWrapper({ route }: { route: Route }) {
  // Check guard - if string, redirect; if false, prevent render
  const guardFn = route.guard();
  if (guardFn) {
    useEffect(() => {
      (async () => {
        const guardResult = await guardFn({}, context);
        if (typeof guardResult === 'string') {
          navigate(guardResult);
        } else if (guardResult === false) {
          navigate('/error');
        }
      })();
    }, []);
  }

  // Apply SEO
  const seo = route.seo();
  useEffect(() => {
    document.title = seo.title || '';
    // Update meta tags...
  }, [seo]);

  // Render your component
  return <YourComponent route={route} />;
}
*/

// ============================================================================
// SITEMAP GENERATION
// ============================================================================

/**
 * Generate sitemap.xml
 */
export function generateSitemap() {
    const entries = routes._sitemap();

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
            .map(
                (entry) => `
  <url>
    <loc>${entry.url}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
            )
            .join('')}
</urlset>`;
}

// ============================================================================
// ACCESS MATRIX GENERATION
// ============================================================================

/**
 * Generate redirect matrix for documentation
 */
export function generateGuardMatrix() {
  return routes._all().map((route) => {
    const guardFn = route.guard();
    const hasGuard = !!guardFn;
    return {
      route: route.name,
      path: route.path,
      hasGuard,
    };
  });
}

