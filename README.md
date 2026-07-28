# Monorepo

Единый pnpm workspace: `apps/*` — приложения (Nest или Vite, тип — в `package.json` → `monorepo.kind`), `packages/*` — настоящие workspace-пакеты (`workspace:*`, без build-шага — сырой `src/`, компилирует сам потребитель), `tools/` — утилиты.

```bash
pnpm install                # один install на весь workspace

pnpm run create:app         # интерактивно
pnpm run create:app -- --kind nest --name api
pnpm run create:app -- --kind react --name web

pnpm run create:package     # интерактивно
pnpm run create:package -- shared
```

Общий код — `packages/<name>`, импорт как `@packages/<name>` (в `dependencies` app'а — `"@packages/<name>": "workspace:*"`). Версии зависимостей — через pnpm catalogs (`pnpm-workspace.yaml`), не дублируются в каждом `package.json`.

```bash
pnpm --filter @apps/<name> dev
pnpm --filter @apps/<name> build
```
