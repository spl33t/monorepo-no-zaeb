---
name: monorepo-scaffold-cli
description: >-
  Scaffold apps, packages, docker-compose, or MCP Postgres in this monorepo via
  pnpm scripts under tools/. When the desired app type and options are known,
  prefer non-interactive one-liners; otherwise tell the user to run the same
  pnpm script interactively in their terminal. Do not duplicate CLI help in
  chat—the scripts and tools/README.md are the source of truth; use --help when
  needed.
---

# Скаффолдинг через CLI

## Когда применять

Новый `apps/*`, `packages/*`, правки `docker-compose`, подключение MCP Postgres, или соблазн **вручную** скопировать дерево приложения — сначала опирайся на CLI в `package.json` / `tools/`.

## Как действовать (главное)

1. **Тип и параметры уже ясны** (например Nest + имя `api`, или пакет `hooks`) — запускай **one-liner** в терминале. Флаги и синтаксис бери из `pnpm create:app -- --help`, `pnpm create:package -- --help`; при необходимости — `tools/README.md` и `tools/create-app.js` / `tools/create-package.js`.

2. **Что создавать не определено** (тип приложения, порт, имя, вариант Vite/Node) — **не угадывай** за пользователя в readline. Предложи ему **самому** запустить `pnpm create:app` или `pnpm create:package` без флагов (интерактивный мастер), затем продолжить задачу.

3. В ответах пользователю **не выкладывай целиком справку CLI** — достаточно команды и ссылки на `--help` или `tools/README.md`, если нужны детали.

Уточнение для `pnpm`: аргументы скрипта отделяй от аргументов pnpm через **`--`** (как в `pnpm create:app -- --kind …`).

## Жёсткие правила

- Только **`pnpm`** (`engines` в корне).
- Не выдумывай структуру приложений/пакетов обходом генераторов — имена и шаблоны должны совпадать с `tools/generators/*`.
- Импорты workspace: навык **`monorepo-modules-imports`** (`@monorepo/…`, без лишних правок `paths` после CLI).
- После скаффолда при пропущенной установке: см. вывод CLI (`pnpm install` / `--filter`).

## Команды-ориентиры (без перечня флагов)

| Сценарий        | Входная точка |
|----------------|----------------|
| Приложение     | `pnpm create:app` |
| Пакет          | `pnpm create:package` |
| Docker Compose | `pnpm create:docker-compose`, базовые `pnpm docker:*` — `package.json` |
| MCP PostgreSQL | `pnpm mcp:add-postgres` (секреты не коммитить) |

Шаблоны и структура: `tools/README.md`. Сомнения по опциям one-liner — сначала `pnpm create:app -- --help` / `pnpm create:package -- --help`, затем при необходимости исходники `tools/create-*.js`.

## Чего не делать

- Не оформлять «как в шаблоне» новое приложение без `create:app`, если нужен стек репозитория.
- Не использовать `npm` / `yarn` для скаффолда в этом репо.
