import { z } from 'zod';

/**
 * Служебный ключ для доступа к сырой zod-схеме в обход ленивого резолва
 * источника значений. Используется только bootstrap-скриптом
 * (`bin/workspace-env.js`), чтобы провалидировать декларацию против
 * собранных сырых значений `.env` ДО того, как что-либо попало в
 * `process.env` — иначе курица и яйцо: сам факт импорта `env.ts` не должен
 * требовать, чтобы `process.env` уже был готов именно для этого пакета.
 * Отдельный от node-варианта (`define-env.ts`) `Symbol(...)` — они никогда
 * не сравниваются друг с другом в одном рантайме: bootstrap-скрипт всегда
 * грузит именно node-вариант напрямую по пути, browser-вариант его вообще
 * не касается. Совпадение символов между вариантами не нужно.
 */
export const ENV_SCHEMA: unique symbol = Symbol('workspace-env.schema');

export type EnvShapeBuilder<Shape extends z.ZodRawShape> = (zod: typeof z) => Shape;

/**
 * Browser-вариант — источник значений `import.meta.env` (Vite сам грузит
 * `.env`/реальные переменные окружения и подставляет их сюда как настоящий
 * объект в рантайме, не только статической заменой). Резолвится через
 * `package.json#exports` `"browser"` condition — её запрашивают bundler'ы
 * клиентского кода (Vite/esbuild по умолчанию для браузерных сборок).
 *
 * Только переменные с префиксом `VITE_` (или настроенным `envPrefix`) реально
 * видны в `import.meta.env` — это ограничение самого Vite, не этого файла:
 * непрефиксованные `.env`-переменные (например серверный `PORT`) сюда не
 * попадают вообще, см. tools/packages/workspace-env/README.md.
 *
 * Инлайнит Proxy-логику целиком, а не импортирует из общего файла —
 * симметрично с node-вариантом (`define-env.ts`), которому это нужно по
 * структурной причине (Node's native ESM resolver при загрузке
 * `vite.config.ts` не резолвит extensionless relative-импорты — см.
 * подробное обоснование там). Здесь такого ограничения нет (esbuild-
 * бандлинг, не Node native resolver) — раздельные копии здесь ради
 * симметрии структуры пакета (два самодостаточных варианта вместо
 * одного самодостаточного и одного тонкого над общим файлом), а не
 * из технической необходимости.
 */
export function defineEnv<Shape extends z.ZodRawShape>(
  builder: EnvShapeBuilder<Shape>,
): z.infer<z.ZodObject<Shape>> {
  const schema = z.object(builder(z));
  type Result = z.infer<typeof schema>;
  let cached: Result | undefined;

  function resolve(): Result {
    if (!cached) {
      const source = import.meta.env as unknown as Record<string, string | undefined>;
      const parsed = schema.safeParse(source);
      if (!parsed.success) {
        throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
      }
      cached = parsed.data;
    }
    return cached;
  }

  // Proxy оборачивает пустой {} — сам по себе он ничего не знает о полях
  // схемы. Без ownKeys/getOwnPropertyDescriptor/has ловушек любой способ
  // доступа, кроме прямого env.FOO (Object.keys, JSON.stringify, spread
  // {...env}, for...in), молча вернул бы пустой объект вместо реальных
  // значений — не ошибку, а тихо неверные данные (проверено вживую). Три
  // ловушки ниже переадресуют обращение к составу полей на resolve(), так же
  // как get уже делает для значений отдельных полей.
  return new Proxy({} as Result, {
    get(_target, prop) {
      if (prop === ENV_SCHEMA) return schema;
      return resolve()[prop as keyof Result];
    },
    has(_target, prop) {
      if (prop === ENV_SCHEMA) return true;
      return prop in resolve();
    },
    ownKeys() {
      return Reflect.ownKeys(resolve());
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (prop === ENV_SCHEMA) return { configurable: true, enumerable: false, value: schema };
      // configurable: true, а не дескриптор самого пустого target'а — target
      // и вправду не имеет этих свойств, но инвариант Proxy для extensible
      // target разрешает ownKeys/getOwnPropertyDescriptor сообщать о
      // "виртуальных" свойствах, если они помечены как configurable.
      if (!(prop in resolve())) return undefined;
      return { configurable: true, enumerable: true, value: resolve()[prop as keyof Result] };
    },
  });
}
