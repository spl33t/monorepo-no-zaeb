# Monorepo

Саб-монорепы `nestjs-apps` и `vite-apps` (у каждого свой npm workspaces). Корневой `tools/` — утилиты.

```bash
# обычно — в том мире, где работаешь
cd nestjs-apps && npm install
cd vite-apps && npm install
npm install                 # root tools

# после clone всего репо — ярлык на три независимых install
npm run deps:install

cd nestjs-apps && npm run create:app
cd vite-apps && npm run create:app
```

Общий код — папки в `*/packages/` (руками). Импорт: `@monorepo/<name>`.

```bash
cd nestjs-apps && npm run dev -w @apps/<app>
cd vite-apps && npm run build -w @apps/<app>
```
