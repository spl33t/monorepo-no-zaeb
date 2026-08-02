import { z } from 'zod';

/**
 * Служебный ключ для доступа к сырой zod-схеме в обход ленивого резолва
 * `process.env`. Используется только bootstrap-скриптом
 * (`bin/workspace-env.js`), чтобы провалидировать декларацию против
 * собранных сырых значений `.env` ДО того, как что-либо попало в
 * `process.env` — иначе курица и яйцо: сам факт импорта `env.ts` не должен
 * требовать, чтобы `process.env` уже был готов именно для этого пакета.
 * Отдельный от browser-варианта (`define-env.browser.ts`) символ — они
 * никогда не сравниваются друг с другом в одном рантайме (см. комментарий
 * у defineEnv ниже), совпадение не нужно.
 */
export const ENV_SCHEMA: unique symbol = Symbol('workspace-env.schema');

export type EnvShapeBuilder<Shape extends z.ZodRawShape> = (zod: typeof z) => Shape;

/**
 * Node-вариант (server, build-time файлы вроде vite.config.ts) — источник
 * значений `process.env`. Резолвится по умолчанию (`package.json#exports`
 * `"default"` condition, указывает прямо сюда, минуя index.ts) — bundler'ы,
 * которые не запрашивают `"browser"` condition (webpack у nest с
 * `target: 'node'`, `tsx`/Node при загрузке `env.ts` bootstrap-скриптом),
 * попадают именно сюда.
 *
 * Инлайнит Proxy-логику целиком, никаких внутренних relative-импортов —
 * намеренно: `vite.config.ts` грузится Node'ом НАПРЯМУЮ (Vite бандлит
 * конфиг через esbuild, но помечает bare-специфайеры вроде
 * `@tools/workspace-env` как external и оставляет их Node'у), а Node's
 * native ESM resolver не умеет extensionless relative-импорты — без явного
 * расширения падает с `ERR_MODULE_NOT_FOUND` (проверено живьём, в том числе
 * что `createRequire`/CJS-путь резолва ту же проблему не обходит — там же
 * `MODULE_NOT_FOUND`). Добавить `.ts`-расширение — не вариант: ломает
 * webpack/`ts-loader` у nest (`TS5097`, а `allowImportingTsExtensions`
 * требует noEmit/emitDeclarationOnly/rewriteRelativeImportExtensions — все
 * три несовместимы с тем, как nest потребляет сырой TS без build-шага,
 * тоже проверено живьём). Единственный файл БЕЗ внутренних relative-
 * импортов Node резолвит нормально — сам bare-специфайер
 * `@tools/workspace-env` резолвится через `package.json#exports`, это Node
 * умеет нативно.
 *
 * `define-env.browser.ts` инлайнит свою копию той же Proxy-логики (не
 * потому что у него то же ограничение — esbuild, не Node native resolver,
 * ему это не нужно, — а ради симметрии структуры пакета: два самодостаточных
 * варианта вместо одного самодостаточного и одного тонкого над общим
 * файлом). ~40 строк дублирования между двумя файлами — сознательный выбор.
 *
 * Декларация + резолвер переменных окружения пакета в одном месте — файл
 * `env.ts`, лежащий рядом с `.env`:
 *
 * ```ts
 * export default defineEnv((z) => ({
 *   POSTGRES_HOST: z.string(),
 *   POSTGRES_PORT: z.coerce.number(),
 * }));
 * ```
 *
 * Возвращает "ленивый" объект: сам факт импорта ничего не трогает и не может
 * упасть — `process.env` читается и валидируется только при первом реальном
 * обращении к полю (`env.POSTGRES_HOST`), результат мемоизируется. Это и
 * делает безопасным импорт `env.ts` из bootstrap-скрипта — он импортирует
 * модуль ради схемы (см. `ENV_SCHEMA`), не трогая ни одного поля, значит
 * валидация в этот момент не запускается.
 *
 * При невалидном `process.env` обращение к полю бросает исключение (не
 * `process.exit` — резолвер не знает, вызван ли он из bootstrap, который
 * должен успеть собрать ошибки всех пакетов, или из реального приложения,
 * где необработанное исключение при импорте и так уронит процесс).
 */
export function defineEnv<Shape extends z.ZodRawShape>(
  builder: EnvShapeBuilder<Shape>,
): z.infer<z.ZodObject<Shape>> {
  const schema = z.object(builder(z));
  type Result = z.infer<typeof schema>;
  let cached: Result | undefined;

  function resolve(): Result {
    if (!cached) {
      const parsed = schema.safeParse(process.env);
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
