// Routes DSL - Type-safe declarative routing for SPA
// Domain model for routes, not router implementation

// ============================================================================
// TYPES & CONTEXT
// ============================================================================

/**
 * Type assertion helper - creates a type-safe context wrapper
 * Used for type inference without runtime logic
 */
export function $type<T>(): T {
  // This is a type-only function, no runtime implementation needed
  return undefined as unknown as T;
}

/**
 * Route parameters extracted from URL
 * In URLs, all parameters are strings - numbers and booleans are application-level interpretations
 */
export type RouteParams = Record<string, string>;

/**
 * SEO metadata object
 * 
 * ⚠️ RULE: SEOConfig must be:
 * - Pure: No side effects
 * - Sync: Synchronous only (no async/await)
 * - Deterministic: Same input always produces same output
 * 
 * This ensures SEO metadata can be safely generated at build time,
 * in edge functions, and in SSR without unpredictable behavior.
 * 
 * ⚠️ IMPORTANT: SEOConfig is a union type:
 * - Either redirect-only (when redirecting, other properties are forbidden)
 * - Or regular SEO (title, description, canonical, robots, etc.)
 * 
 * This prevents errors when redirect and other SEO properties are used together.
 */
export type SEOConfig<TParams extends RouteParams = RouteParams> =
  | {
    /**
     * SEO redirect (document-level HTTP redirect)
     * 
     * Purpose: URL changes, duplicate elimination, SEO weight transfer
     * 
     * Properties:
     * - HTTP redirect (executed before SPA)
     * - Does NOT depend on user/context
     * - Used by backend/edge
     * 
     * Semantics: "Does this URL exist as a document?"
     * (vs SPA redirect: "Can the user see this page?")
     * 
     * When redirect is present:
     * - All other SEO properties are forbidden (canonical, robots, title, description, og, twitter, etc.)
     * - indexable is automatically false
     * - robots is automatically noindex, nofollow
     * - Page is excluded from sitemap
     */
    redirect: {
      /** Target URL for redirect (can be function of params) */
      to: ((params: TParams) => string) | string;
      /** HTTP redirect status code (defaults to 301) */
      status?: 301 | 302 | 307 | 308;
    };
  } & {
    // Forbid any other unknown properties (except redirect)
    [K in string as K extends 'redirect' ? never : K]: never;
  }
  | {
    /** Generate title from params or static string */
    title?: ((params: TParams) => string) | string;
    /** Generate description from params or static string */
    description?: ((params: TParams) => string) | string;

    /** 
     * Whether the page should be indexed by search engines (declarative intent)
     * - true: page can be indexed (public)
     * - false: page should not be indexed (private)
     * 
     * If false, automatically sets robots.index = false and robots.follow = false
     * unless explicitly overridden in robots config
     */
    indexable?: boolean;

    /**
     * Robots directives for search engines (technical implementation)
     * - index: false → noindex
     * - follow: false → nofollow
     * 
     * Can be used for fine-grained control or exceptions to indexable rule
     */
    robots?: {
      /** Whether search engines should index this page */
      index?: boolean;
      /** Whether search engines should follow links on this page */
      follow?: boolean;
    };

    /** Open Graph tags for social media sharing */
    og?: {
      /** og:title - defaults to title if not provided */
      title?: ((params: TParams) => string) | string;
      /** og:description - defaults to description if not provided */
      description?: ((params: TParams) => string) | string;
      /** og:image - URL to image */
      image?: ((params: TParams) => string) | string;
      /** og:url - canonical URL */
      url?: ((params: TParams) => string) | string;
      /** og:type - content type (article, website, etc.) */
      type?: ((params: TParams) => string) | string;
      /** og:site_name - site name */
      siteName?: ((params: TParams) => string) | string;
    };

    /** Twitter Card tags */
    twitter?: {
      /** twitter:card - card type (summary, summary_large_image, etc.) */
      card?: ((params: TParams) => 'summary' | 'summary_large_image' | 'app' | 'player') | 'summary' | 'summary_large_image' | 'app' | 'player';
      /** twitter:title - defaults to title if not provided */
      title?: ((params: TParams) => string) | string;
      /** twitter:description - defaults to description if not provided */
      description?: ((params: TParams) => string) | string;
      /** twitter:image - URL to image */
      image?: ((params: TParams) => string) | string;
      /** twitter:site - Twitter username */
      site?: ((params: TParams) => string) | string;
      /** twitter:creator - Twitter username of creator */
      creator?: ((params: TParams) => string) | string;
    };

    /** Canonical URL */
    canonical?: ((params: TParams) => string) | string;

    /** Additional meta tags */
    meta?: Record<string, ((params: TParams) => string) | string>;

    /** redirect is forbidden when other SEO properties are present */
    redirect?: never;
  };

/**
 * SPA configuration
 * 
 * Configuration for Single Page Application runtime behavior.
 * Unlike SEO, SPA functions can be async and depend on context.
 */
export type SPAConfig<
  TParams extends RouteParams = RouteParams,
  TContext = unknown,
  TData = unknown
> = {
  /**
   * Guard function, executed before component render.
   * Can return redirect path (string) or false to prevent render.
   * Can be async for data fetching.
   * 
   * @returns
   * - string: redirect to this path
   * - false: prevent render (show error/loading)
   * - true/undefined: allow render
   */
  guard?: (params: TParams, context: TContext) => string | boolean | Promise<string | boolean>;

  /**
   * Route-level context data.
   * Typed data that will be passed to the component.
   * Can be async for data fetching.
   * 
   * @returns Typed context data that will be available to the component
   */
  context?: (params: TParams, context: TContext) => TData | Promise<TData>;
};

/**
 * Route definition
 */
export interface RouteDefinition<
  TPath extends string = string,
  TParams extends RouteParams = RouteParams,
  TContext = unknown,
  TData = unknown
> {
  /** URL path pattern (e.g., "/user/:id" or "/product/:slug") */
  path: TPath;

  /** SEO metadata configuration */
  seo?: SEOConfig<TParams>;

  /**
   * Guard function, executed before component render.
   * Can return redirect path (string) or false to prevent render.
   * Can be async for data fetching.
   * 
   * @returns
   * - string: redirect to this path
   * - false: prevent render (show error/loading)
   * - true/undefined: allow render
   */
  guard?: (params: TParams, context: TContext) => string | boolean | Promise<string | boolean>;

  /**
   * Route-level context data.
   * Typed data that will be passed to the component.
   * Can be async for data fetching.
   * 
   * @returns Typed context data that will be available to the component
   */
  context?: (params: TParams, context: TContext) => TData | Promise<TData>;

  /** Cache control */
  cache?: {
    /** Cache TTL in seconds */
    ttl?: number;
    /** Cache tags for invalidation */
    tags?: string[];
  };
}

/**
 * Normalized route with runtime methods
 */
export interface Route<
  TPath extends string = string,
  TParams extends RouteParams = RouteParams,
  TData = unknown,
  TContext = unknown
> {
  /** Original path pattern */
  readonly path: TPath;

  /** Route name */
  readonly name: string;

  /** Generate URL with params */
  url: (params?: Partial<TParams>) => string;

  /** Get SEO metadata */
  seo: (params?: Partial<TParams>) => {
    title: string;
    description: string;
    indexable?: boolean;
    robots?: {
      index?: boolean;
      follow?: boolean;
    };
    redirect?: {
      to: string;
      status?: 301 | 302 | 307 | 308;
    };
    og?: {
      title?: string;
      description?: string;
      image?: string;
      url?: string;
      type?: string;
      siteName?: string;
    };
    twitter?: {
      card?: 'summary' | 'summary_large_image' | 'app' | 'player';
      title?: string;
      description?: string;
      image?: string;
      site?: string;
      creator?: string;
    };
    canonical?: string;
    meta?: Record<string, string>;
  };

  /** Get guard function */
  guard: (params?: Partial<TParams>) => ((params: TParams, context: TContext) => string | boolean | Promise<string | boolean>) | undefined;

  /** Get context function */
  context: (params?: Partial<TParams>) => ((params: TParams, context: TContext) => TData | Promise<TData>) | undefined;

  /** Get cache config */
  readonly cache?: RouteDefinition['cache'];
}

/**
 * Extract context type from context object with $type assertions
 */
export type ExtractContextType<TContextShape extends Record<string, unknown>> = {
  [K in keyof TContextShape]: TContextShape[K] extends ReturnType<typeof $type<infer T>>
  ? T
  : TContextShape[K];
};

/**
 * Routes factory configuration
 */
export interface RoutesFactoryConfig<TContextShape extends Record<string, unknown> = Record<string, unknown>> {
  /** SPA context shape with $type assertions for each prop */
  spaContext: TContextShape;
}

/**
 * Routes factory - creates routes with context
 */
export interface RoutesFactory<TContext = unknown> {
  /**
   * Create routes from definitions
   */
  <TRoutes extends Record<string, RouteDefinition<string, RouteParams, TContext, any>>>(
    definitions: TRoutes
  ): {
    [K in keyof TRoutes]: Route<
      TRoutes[K]['path'],
      ExtractParams<TRoutes[K]['path']>,
      TRoutes[K] extends RouteDefinition<any, any, any, infer TData> ? TData : unknown,
      TContext
    >;
  } & {
    /** Get all routes */
    _all: () => Route<string, RouteParams, any, TContext>[];

    /** Generate sitemap */
    _sitemap: () => SitemapEntry[];

    /** Generate SEO manifest */
    _seoManifest: () => SEOManifest;
  };
}


// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Extract params from path pattern
 * "/user/:id" -> { id: string }
 * "/product/:slug/:page?" -> { slug: string; page?: string }
 */
export type ExtractParams<TPath extends string> = TPath extends `${string}:${infer Param}/${infer Rest}`
  ? Param extends `${infer Name}?`
  ? { [K in Name]?: string } & ExtractParams<`/${Rest}`>
  : { [K in Param]: string } & ExtractParams<`/${Rest}`>
  : TPath extends `${string}:${infer Param}`
  ? Param extends `${infer Name}?`
  ? { [K in Name]?: string }
  : { [K in Param]: string }
  : Record<string, never>;

/**
 * Sitemap entry
 */
export interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

/**
 * SEO manifest entry
 */
export interface SEOManifestEntry {
  route: string;
  path: string;
  seo: {
    title: string;
    description: string;
  };
}

/**
 * SEO manifest
 */
export type SEOManifest = SEOManifestEntry[];

// ============================================================================
// FACTORY IMPLEMENTATION
// ============================================================================

/**
 * Create routes factory with context
 * Creates a typed factory for creating routes
 * 
 * @example
 * ```typescript
 * const createRoutes = createRoutesFactory({
 *   context: {
 *     user: $type<User>(),
 *     permissions: $type<string[]>(),
 *   }
 * });
 * ```
 */
export function createRoutesFactory<
  TContextShape extends Record<string, unknown>
>(
  config: RoutesFactoryConfig<TContextShape>
): RoutesFactory<ExtractContextType<TContextShape>> {
  type TContext = ExtractContextType<TContextShape>;

  // In runtime, $type returns undefined, so we need to get real values
  // For now, return a context object with undefined values
  // In real usage, you'd get these from your state management
  const getContext = (): TContext => {
    const context = {} as TContext;
    for (const key in config.spaContext) {
      // $type returns undefined, so we set undefined
      // In real app, you'd get actual values from state management
      (context as any)[key] = undefined;
    }
    return context;
  };

  return <TRoutes extends Record<string, RouteDefinition<string, RouteParams, TContext, any>>>(
    definitions: TRoutes
  ) => {
    const routes = {} as any;
    const routeList: Route<string, RouteParams, any, TContext>[] = [];

    for (const [key, definition] of Object.entries(definitions)) {
      const route = createRoute(definition, key, getContext);
      routes[key] = route;
      routeList.push(route);
    }

    return {
      ...routes,
      _all: () => routeList,
      _sitemap: () => {
        // Exclude routes with SEO redirect (they don't exist as documents)
        return routeList
          .filter((r) => {
            const seo = r.seo();
            return !seo.redirect; // Exclude if has SEO redirect
          })
          .map((r) => ({
            url: r.url(),
            lastmod: new Date().toISOString(),
            changefreq: 'daily' as const,
            priority: 0.8,
          }));
      },
      _seoManifest: () => {
        // Exclude routes with SEO redirect (they don't exist as documents)
        return routeList
          .filter((r) => {
            const seo = r.seo();
            return !seo.redirect; // Exclude if has SEO redirect
          })
          .map((r) => ({
            route: r.name,
            path: r.path,
            seo: r.seo(),
          }));
      },
    };
  };
}

/**
 * Create normalized route from definition
 */
function createRoute<TContext = unknown, TData = unknown>(
  definition: RouteDefinition<string, RouteParams, TContext, TData>,
  name: string,
  getContext: () => TContext
): Route<string, RouteParams, TData, TContext> {
  const routeName = name;

  const url = (params: Partial<RouteParams> = {}) => {
    let path = definition.path;

    // Replace params in path
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        const pattern = new RegExp(`:${key}(\\?)?`, 'g');
        path = path.replace(pattern, value);
      }
    }

    // Remove optional params that weren't provided
    path = path.replace(/\/:[^/]+\?/g, '');

    return path;
  };

  const seo = (params: Partial<RouteParams> = {}): {
    title: string;
    description: string;
    indexable?: boolean;
    robots?: {
      index?: boolean;
      follow?: boolean;
    };
    redirect?: {
      to: string;
      status?: 301 | 302 | 307 | 308;
    };
    og?: {
      title?: string;
      description?: string;
      image?: string;
      url?: string;
      type?: string;
      siteName?: string;
    };
    twitter?: {
      card?: 'summary' | 'summary_large_image' | 'app' | 'player';
      title?: string;
      description?: string;
      image?: string;
      site?: string;
      creator?: string;
    };
    canonical?: string;
    meta?: Record<string, string>;
  } => {
    if (!definition.seo) {
      return {
        title: routeName,
        description: '',
      };
    }
    const fullParams = params as RouteParams;

    // Helper to resolve value (string or function)
    const resolve = <T>(value: ((params: RouteParams) => T) | T | undefined, defaultValue?: T): T | undefined => {
      if (value === undefined) return defaultValue;
      if (typeof value === 'function') {
        return (value as (params: RouteParams) => T)(fullParams);
      }
      return value;
    };

    // Helper to resolve object with optional fields
    const resolveObject = <T extends Record<string, ((params: RouteParams) => any) | any>>(
      obj: T | undefined,
      defaults?: Partial<Record<keyof T, any>>
    ): Record<string, any> | undefined => {
      if (!obj) return undefined;
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const resolved = resolve(value, defaults?.[key]);
        if (resolved !== undefined) {
          result[key] = resolved;
        }
      }
      return Object.keys(result).length > 0 ? result : undefined;
    };

    // Helper to assign resolved value if defined
    const assignIfDefined = <T>(target: Record<string, any>, key: string, value: T | undefined): void => {
      if (value !== undefined) {
        target[key] = value;
      }
    };

    // Check if this is a redirect-only SEO config
    if ('redirect' in definition.seo && definition.seo.redirect) {
      // Redirect-only mode: only redirect, all other properties are forbidden
      const redirectTo = typeof definition.seo.redirect.to === 'function'
        ? definition.seo.redirect.to(fullParams)
        : definition.seo.redirect.to;

      return {
        title: routeName, // Fallback title
        description: '', // Empty description
        indexable: false, // Automatically false for redirects
        robots: {
          index: false, // Automatically noindex
          follow: false, // Automatically nofollow
        },
        redirect: {
          to: redirectTo,
          status: definition.seo.redirect.status ?? 301, // Default to 301 (permanent)
        },
      };
    }

    // Regular SEO mode: process all SEO properties (redirect is forbidden here)
    const title = resolve(definition.seo.title) || routeName;
    const description = resolve(definition.seo.description) || '';

    const result: {
      title: string;
      description: string;
      indexable?: boolean;
      robots?: {
        index?: boolean;
        follow?: boolean;
      };
      redirect?: {
        to: string;
        status?: 301 | 302 | 307 | 308;
      };
      og?: {
        title?: string;
        description?: string;
        image?: string;
        url?: string;
        type?: string;
        siteName?: string;
      };
      twitter?: {
        card?: 'summary' | 'summary_large_image' | 'app' | 'player';
        title?: string;
        description?: string;
        image?: string;
        site?: string;
        creator?: string;
      };
      canonical?: string;
      meta?: Record<string, string>;
    } = {
      title,
      description,
    };

    // Indexable flag (declarative intent)
    if (definition.seo.indexable !== undefined) {
      result.indexable = definition.seo.indexable;
    }

    // Robots directives (technical implementation)
    // Rule: if indexable === false, default robots.index = false and robots.follow = false
    // unless explicitly overridden in robots config
    if (definition.seo.robots || definition.seo.indexable !== undefined) {
      const robots: { index?: boolean; follow?: boolean } = {};

      // If indexable is explicitly false, set defaults
      if (definition.seo.indexable === false) {
        robots.index = false;
        robots.follow = false;
      }

      // Override with explicit robots config if provided
      if (definition.seo.robots) {
        if (definition.seo.robots.index !== undefined) {
          robots.index = definition.seo.robots.index;
        }
        if (definition.seo.robots.follow !== undefined) {
          robots.follow = definition.seo.robots.follow;
        }
      }

      // Only add robots if at least one directive is set
      if (robots.index !== undefined || robots.follow !== undefined) {
        result.robots = robots;
      }
    }

    // Open Graph tags
    if (definition.seo.og) {
      const og = resolveObject(definition.seo.og, {
        title,
        description,
        type: 'website',
      });
      if (og && Object.keys(og).length > 0) {
        result.og = og as NonNullable<typeof result.og>;
      }
    }

    // Twitter Card tags
    if (definition.seo.twitter) {
      const twitter = resolveObject(definition.seo.twitter, {
        card: 'summary',
        title,
        description,
      });
      if (twitter && Object.keys(twitter).length > 0) {
        result.twitter = twitter as NonNullable<typeof result.twitter>;
      }
    }

    // Canonical URL
    const canonical = resolve(definition.seo.canonical);
    if (canonical !== undefined) {
      result.canonical = canonical;
    }

    // Additional meta tags
    if (definition.seo.meta) {
      const meta = resolveObject(definition.seo.meta);
      if (meta) {
        result.meta = meta as Record<string, string>;
      }
    }

    return result;
  };

  const guard = (params: Partial<RouteParams> = {}) => {
    if (!definition.guard) {
      return undefined;
    }
    return (guardParams: RouteParams, guardContext: TContext) => 
      definition.guard!(guardParams, guardContext);
  };

  const context = (params: Partial<RouteParams> = {}) => {
    if (!definition.context) {
      return undefined;
    }
    return (contextParams: RouteParams, contextValue: TContext): TData | Promise<TData> => 
      definition.context!(contextParams, contextValue);
  };

  return {
    path: definition.path,
    name: routeName,
    url,
    guard,
    context,
    seo,
    cache: definition.cache,
  };
}


