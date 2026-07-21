# 🛠️ Инструменты монорепозитория

CLI утилиты для управления монорепозиторием.

## Создание нового приложения

```bash
pnpm create:app
```

Интерактивно создаст новое приложение:
- Выбор типа (Node.js, NestJS, Vite)
- Для Vite: выбор фреймворка (React/Vanilla)
- Название приложения
- Генерация структуры файлов и конфигов
- Автоматическая настройка всех скриптов

### Типы приложений

1. **Node.js TypeScript** - простое Node.js приложение
2. **NestJS API сервер** - NestJS приложение с контроллерами и сервисами
3. **Vite приложение**:
   - React + TypeScript
   - Vanilla HTML + TypeScript

### Структура созданного приложения

**Node.js/NestJS:**
```
apps/your-app/
├── src/
│   └── index.ts (или main.ts для NestJS)
├── package.json
├── tsconfig.json
└── .env.example
```

**Vite:**
```
apps/your-app/
├── src/
│   ├── main.tsx (React) или main.ts (Vanilla)
│   ├── App.tsx (React)
│   └── vite-env.d.ts
├── index.html
├── vite.config.ts
├── package.json
├── tsconfig.json
└── .env.example
```

## Создание нового пакета

```bash
pnpm create:package
```

Интерактивно создаст новый пакет:
- Название пакета
- Генерация структуры
- Автоматически доступен через `@monorepo/<name>`

### Структура созданного пакета

```
packages/your-package/
├── src/
│   └── index.ts          # Экспорты
└── package.json          # Манифест пакета
```

## Освободить порт

```bash
pnpm kill:port              # интерактивно: список apps + статус порта
pnpm kill:port 3000
pnpm kill:port 3000 5173
```

Завершает процессы, слушающие указанные TCP-порты (Windows, Linux, macOS).

## Примеры использования

### Создать NestJS приложение

```bash
pnpm create:app
# Тип: 2 (NestJS)
# Название: api

# Результат:
# apps/api/ создано ✅
# Автоматически настроены: контроллер, сервис, модуль
```

### Создать Vite React приложение

```bash
pnpm create:app
# Тип: 3 (Vite)
# Фреймворк: 1 (React)

# Результат:
# apps/your-app/ создано ✅
# Готовый React шаблон
```

### Создать пакет

```bash
pnpm create:package
# Название: validation

# Результат:
# packages/validation/ создано ✅
# Можно импортировать: import { ... } from '@monorepo/validation'
```

## node-run (Node/Nest)

`pnpm` scripts `dev` / `build` / `start` в Node-приложениях вызывают `@monorepo/node-run`. Архитектура резолва (`@monorepo/*` + изоляция npm-deps пакетов): [`node-run/ARCHITECTURE.md`](node-run/ARCHITECTURE.md).

## Разработка инструментов

Структура `tools/`:

| Папка | Назначение |
|-------|------------|
| `cli/` | Точки входа CLI (`create:app`, `kill:port`, docker и т.д.) |
| `generators/` | Генераторы файлов для скаффолда приложений |
| `node-run/` | Runtime Node/Nest (ttsc + tsx + resolve hook) |
| `plugins/` | Зарезервировано (ранее — плагины tsdown) |
| `lib/` | Общие утилиты для CLI и генераторы |
| `templates/` | Статические шаблоны (MCP и др.) |

Скрипты в корневом `package.json` указывают на `tools/cli/*`. Генераторы не требуют дополнительных зависимостей.

