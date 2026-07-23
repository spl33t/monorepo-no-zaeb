# Инструменты монорепозитория

```
nestjs-apps/tools/     # create:app (тонкий CLI) + generators
vite-apps/tools/       # create:app (тонкий CLI) + generators
tools/                 # create-app-shell, docker-compose, kill-port, remove-app, …
```

`nest`/`vite`/`tsc`/`cross-env` — обычные deps (toolchain-root или root `package.json`), без шимов и обёрток. `npm run` сам добавляет `node_modules/.bin` каждой родительской директории на диске в PATH (`@npmcli/run-script`, `set-path.js`) — резолвится штатно, независимо от того, в каком npm-проекте объявлена зависимость.

`packages/` — не scaffold-ят CLI: просто создай папку.
- root `packages/` → `@root-packages/<name>` (deps в root `package.json`)
- `nestjs-apps|vite-apps/packages/` → `@toolchain-packages/<name>`

## Создание apps

```bash
cd nestjs-apps && npm run create:app
cd vite-apps && npm run create:app
```

## Глобальные утилиты

```bash
npm run kill:port
npm run docker:create-compose
npm run remove:app          # интерактивно, или: npm run remove:app -- api --toolchain nestjs --yes
```

## Зависимости

Один скрипт без флагов — сам выбирает корни и режим:

```bash
npm run deps:install
# = node tools/cli/install-deps.js
```

| Сигнал | Поведение |
|--------|-----------|
| есть `package.json` у корня | ставим этот корень |
| Docker (`/.dockerenv`) или `CI=true` | `npm ci` |
| иначе | `npm install` |
| `NODE_ENV=production` | `--omit=dev` |

В Docker: COPY только нужные `package.json` (Nest → root+nestjs, Vite → root+vite), затем тот же `RUN node tools/cli/install-deps.js`. В production stage — `ENV NODE_ENV=production` перед RUN.
