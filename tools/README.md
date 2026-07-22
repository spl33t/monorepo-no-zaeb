# Инструменты монорепозитория

```
nestjs-apps/tools/     # create:app (тонкий CLI) + generators + nest-cli
vite-apps/tools/       # create:app (тонкий CLI) + generators + vite-cli
tools/                 # create-app-shell, docker-compose, kill-port, …
```

`packages/` — не scaffold-ят CLI: просто создай папку и импортируй `@monorepo/<name>`.

## Создание apps

```bash
cd nestjs-apps && npm run create:app
cd vite-apps && npm run create:app
```

## Глобальные утилиты

```bash
npm run kill:port
npm run docker:create-compose
```

## Зависимости

Обычный `npm install` в нужном корне. После clone всего репо — опциональный ярлык (три независимых install, не общий workspace):

```bash
cd nestjs-apps && npm install
cd vite-apps && npm install
npm install                 # root tools

npm run deps:install        # root → nestjs-apps → vite-apps
```
