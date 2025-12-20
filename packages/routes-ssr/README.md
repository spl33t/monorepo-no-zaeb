# @monorepo/routes-ssr

Framework-agnostic type-safe SSR routing with page functions for Edge/SSR applications.

## 🎯 Концепция

**Контракт - единственный источник правды.** Каждая страница описывается через **pageFunction**, которая:
- Получает `params` (из URL) и `rootContext` (app-level контекст)
- Возвращает `PageResult` с `routeContext`, `seo`, и различными типами ответов (redirect, notFound, etc.)
- Может быть асинхронной (делать фетчи, проверять guards)
- **Редиректы работают одинаково** в SPA навигации и при первичной загрузке страницы

## 🏗️ Архитектура

Библиотека разделена на:
- **Core** - полностью фреймворк-агностичный, содержит только типы и утилиты
- **Adapters** - адаптеры для конкретных фреймворков (React Router, Vue Router, и т.д.)

```
@monorepo/routes-ssr
├── core (фреймворк-агностичный)
│   ├── PageFunction
│   ├── PageResult
│   ├── Route matching
│   └── SEO helpers
└── adapters/react-router (React-специфичный)
    ├── RouteContextProvider
    ├── ReactRouterAdapter
    └── useRouteContext
```

## 📦 Установка

```bash
npm install @monorepo/routes-ssr
```

Для использования с React Router:
```bash
npm install react react-router-dom
```

## 🚀 Быстрый старт

### 1. Определение типов

```typescript
type AppRootContext = {
  requestId: string;
  locale: 'ru' | 'en';
  session: { userId: string | null } | null;
};

type ProfileRouteContext = {
  userId: string;
  user: { id: string; name: string };
};
```

### 2. Создание pageFunction

```typescript
import { type PageFunction } from '@monorepo/routes-ssr';

const ProfilePage: PageFunction<
  { id: string },
  AppRootContext,
  ProfileRouteContext
> = async (params, rootContext) => {
  // Guard: проверка авторизации
  if (!rootContext.session?.userId) {
    return {
      type: 'redirect',
      to: '/login',
    };
  }
  
  // Preload данных
  const user = await fetchUser(params.id);
  
  if (!user) {
    return {
      type: 'notFound',
    };
  }
  
  return {
    type: 'ok',
    routeContext: {
      userId: params.id,
      user,
    },
    seo: {
      title: `Profile: ${user.name}`,
      description: `View profile of ${user.name}`,
      indexable: false,
    },
  };
};
```

### 3. Определение роутов

```typescript
import { defineRoute, createRoutesFactory } from '@monorepo/routes-ssr';

const createRoutes = createRoutesFactory<AppRootContext>({
  getRootContext: async () => {
    // Получение rootContext из запроса
    return {
      requestId: crypto.randomUUID(),
      locale: 'ru',
      session: await getSession(),
    };
  },
});

export const routes = createRoutes({
  profile: defineRoute('/profile/:id', ProfilePage),
  product: defineRoute('/product/:slug', ProductPage),
});
```

### 4. Server-Side (Edge Handler)

```typescript
import { pageResultToResponse } from '@monorepo/routes-ssr';

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const match = routes._match(url.pathname);
  
  if (!match) {
    return new Response('Not Found', { status: 404 });
  }
  
  // Инициализация rootContext
  const rootContext: AppRootContext = {
    requestId: crypto.randomUUID(),
    locale: 'ru',
    session: await getSession(request),
  };
  
  // Вызов pageFunction
  const pageResult = await match.route.page(match.params, rootContext);
  
  // Конвертация PageResult в Response
  // pageResultToResponse автоматически обрабатывает:
  // - redirects (301, 302, 307, 308)
  // - error status codes (401, 403, 404, 410, 451)
  // - SEO теги
  // - инъекцию routeContext для клиента
  return pageResultToResponse(pageResult, {
    renderHTML: (routeContext) => {
      // Рендер вашего приложения (React, Vue, и т.д.)
      return renderToString(<App routeContext={routeContext} />);
    },
    baseHTML: `
<!DOCTYPE html>
<html lang="ru">
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
```

### 5. Client-Side (React Router)

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import {
  RouteContextProvider,
  ReactRouterAdapter,
  useRouteContext,
} from '@monorepo/routes-ssr/adapters/react-router';
import { routes } from './routes';

function App() {
  return (
    <BrowserRouter>
      <RouteContextProvider>
        <ReactRouterAdapter
          routes={routes}
          getRootContext={async () => {
            // Получение rootContext на клиенте
            return {
              requestId: crypto.randomUUID(),
              locale: 'ru',
              session: await getClientSession(),
            };
          }}
        />
        <Routes>
          {routes._mapPages({
            profile: ProfileComponent,
            product: ProductComponent,
          }).map(({ key, path, component: Component }) => (
            <Route key={key} path={path} element={<Component />} />
          ))}
        </Routes>
      </RouteContextProvider>
    </BrowserRouter>
  );
}

// Использование routeContext в компонентах
function ProfileComponent() {
  const context = useRouteContext<ProfileRouteContext>();
  
  if (!context) {
    return <div>Loading...</div>;
  }
  
  return <div>Profile: {context.user.name}</div>;
}
```

## 📚 API

### Core Types

- `PageFunction<TParams, TRootContext, TRouteContext>` - тип page function
- `PageResult<TRouteContext>` - результат page function (union type с `type: 'ok' | 'redirect' | 'notFound' | ...`)
- `RouteDefinition<TPath, TParams, TRootContext, TRouteContext>` - определение роута
- `SEOConfig` - конфигурация SEO
- `RootContext` - базовый контекст приложения
- `RouteContext` - контекст роута (данные для компонента)

### Core Functions

- `defineRoute(path, page)` - создать route definition с type inference
- `createRoutesFactory(config)` - создать factory для типизированных роутов
- `matchRoute(routes, url)` - найти роут по URL
- `extractParams(pattern, url)` - извлечь params из URL
- `generateMetaTags(seo)` - сгенерировать HTML meta теги
- `generateRouteContextScript(routeContext)` - сгенерировать script для инъекции routeContext
- `getRouteContextFromWindow<T>()` - получить routeContext из window (клиент)
- `pageResultToResponse(result, options)` - конвертировать PageResult в HTTP Response

### React Router Adapter

```typescript
import {
  RouteContextProvider,
  ReactRouterAdapter,
  useRouteContext,
} from '@monorepo/routes-ssr/adapters/react-router';
```

- `RouteContextProvider` - провайдер для route context
- `ReactRouterAdapter` - компонент, который выполняет page functions при навигации
- `useRouteContext<T>()` - хук для доступа к route context

## ✨ Преимущества

- ✅ **Framework-agnostic** - core не зависит от конкретного фреймворка
- ✅ **Единственный источник правды** - контракт (pageFunction) определяет поведение страницы
- ✅ **Редиректы работают везде** - одинаково в SSR и SPA навигации
- ✅ **Полная асинхронность** - можно делать любые фетчи до рендеринга
- ✅ **Строгая типизация** - routeContext типизирован для каждой страницы
- ✅ **SEO и redirects** - декларативно из pageFunction
- ✅ **SPA сохраняется** - после SSR клиент подхватывает состояние
- ✅ **Edge-ready** - можно разнести по функциям edge, всё синхронно и быстро

## 🔄 Поток выполнения

### Server-Side (SSR)
```
Request 
  -> match route -> params
  -> rootContext
  -> pageFunction(params, rootContext)
      -> guard, preload, SEO, redirect
  -> PageResult
  -> pageResultToResponse
      -> handle redirect/errors
      -> render HTML
      -> inject SEO, routeContext
  -> Response(HTML)
```

### Client-Side (SPA Navigation)
```
Route change
  -> ReactRouterAdapter detects change
  -> match route -> params
  -> rootContext
  -> pageFunction(params, rootContext)
      -> guard, preload, SEO, redirect
  -> PageResult
  -> handle redirect/errors (navigate)
  -> update routeContext
  -> components re-render with new context
```

## 🎨 Типы PageResult

`PageResult` - это union type, который явно описывает все возможные результаты:

```typescript
type PageResult =
  | { type: 'ok'; routeContext: TRouteContext; seo?: SEOConfig }
  | { type: 'redirect'; to: string; status?: 301 | 302 | 307 | 308 }
  | { type: 'notFound' }           // 404
  | { type: 'unauthorized' }        // 401
  | { type: 'forbidden' }           // 403
  | { type: 'gone' }                // 410
  | { type: 'unavailableForLegalReasons' } // 451
```

Это позволяет:
- Явно обрабатывать все случаи
- Использовать правильные HTTP статус коды
- Типобезопасно работать с результатами

## 📖 Примеры

См. `src/example.ts` для полных примеров использования.

## 🔌 Создание адаптеров для других фреймворков

Адаптер должен:
1. Выполнять page functions при изменении роута
2. Обрабатывать redirects и error status codes
3. Предоставлять доступ к routeContext для компонентов
4. Работать с SSR (использовать initial context из window)

Пример структуры адаптера:
```typescript
// adapters/vue-router/index.ts
export function VueRouterAdapter(routes, getRootContext) {
  // Реализация для Vue Router
}
```

## 🤝 Contributing

Приветствуются адаптеры для других фреймворков (Vue Router, SvelteKit, и т.д.)!
