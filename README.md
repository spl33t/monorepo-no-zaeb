# 🚀 Monorepo БЕЗ ЗАЕБОВ

TypeScript монорепозиторий. Всё работает автоматически.

## Быстрый старт

```bash
# Установка
pnpm install

# Создать пакет
pnpm create:package

# Создать приложение
pnpm create:app
```

## Использование

### Команды

```bash
# Разработка с автоперезапуском
pnpm --filter <app> dev

# Сборка
pnpm --filter <app> build

# Запуск собранного
pnpm --filter <app> start
```

### Импорт пакетов

```typescript
// Просто импортируй - работает сразу
import { something } from '@monorepo/your-package';
```

### Watch mode

Автоматически перезапускается при изменении:
- Кода приложения
- **Кода в packages** ✨

## Типы приложений

1. **Node.js TypeScript** - простое Node.js приложение
2. **NestJS API** - NestJS сервер
3. **Vite** - React или Vanilla HTML + TypeScript

Всё настроено автоматически. Просто создавай и работай. 🚀
