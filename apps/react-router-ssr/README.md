# React Router SSR

React Router приложение с SSR на базе `@monorepo/page-contract`.

## Структура

- `src/routes.ts` - определение роутов с page functions
- `src/pages/` - React компоненты страниц
- `src/server.tsx` - SSR entry point
- `src/client.tsx` - клиентский entry point для гидратации
- `server.js` - Express сервер с Vite middleware

## Использование

### Development

```bash
# SSR режим с hot reload
npm run dev:ssr
```

### Production

```bash
# Сборка клиента и сервера
npm run build:ssr

# Запуск production сервера
npm run dev:ssr
```

## Как это работает

1. **Page Functions** (`src/routes.ts`) - определяют логику для каждой страницы:
   - Guards (проверка доступа)
   - Preload данных
   - SEO конфигурация
   - Redirects

2. **SSR Server** (`src/server.tsx`):
   - Матчит роут по URL
   - Вызывает page function
   - Рендерит React на сервере
   - Инжектит routeContext для клиента

3. **Client Hydration** (`src/client.tsx`):
   - Получает routeContext из `window.__ROUTE_CONTEXT__`
   - Гидратирует React приложение

4. **Components** используют `useRouteContext()` для доступа к данным страницы

## Примеры

См. `src/routes.ts` для примеров page functions и `src/pages/` для примеров компонентов.


