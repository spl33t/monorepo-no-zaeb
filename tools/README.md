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
├── nodemon.json
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

## Разработка инструментов

Инструменты в этой папке:
- `create-app.js` - генератор приложений
- `create-package.js` - генератор пакетов

Все инструменты используют Node.js и не требуют дополнительных зависимостей.

