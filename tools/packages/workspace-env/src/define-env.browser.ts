// Этот файл — не часть чьего-то app-tsconfig (у него нет своего "родного"
// tsconfig.json, он резолвится ТРАНЗИТИВНО через package.json#exports у
// того, кто импортирует @env/@packages/*/@monorepo) — поэтому не может
// рассчитывать на apps/<name>/tsconfig.json#types: ["vite/client"], который
// даёт ambient ImportMeta.env там. Открытый отдельно (или ещё не
// импортированный ни одним app'ом) — orphan-файл с TS-дефолтами, без единого
// ambient-типа для import.meta.env (TS2339, проверено живьём). Тот же
// инструмент, что и /// <reference lib="dom" /> для .tsx-пакетов (см.
// tools/packages/workspace-env/README.md/SKILL.md) — точечно на уровне
// файла, а не глобальный tsconfig-флаг. vite — devDependency этого пакета
// только ради этого ambient-типа, в рантайме не импортируется.
/// <reference types="vite/client" />

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

// Ключи РЕЗУЛЬТАТА (не Shape) с префиксом VITE_ — то же ограничение, что Vite
// сам накладывает на `import.meta.env`. Именно от инферренного Result, а не
// от Shape: `keyof Shape` и `keyof z.infer<z.ZodObject<Shape>>` для zod v4 —
// два структурно разных (хоть и рантайм-эквивалентных) типа из-за внутренней
// obj/optional-развёртки инфер-машинерии zod, `Extract` от Shape не
// присваивается обратно в `Pick<z.infer<...>, ...>` (проверено тайпчеком).
// Вычислено template literal type'ом, а не просто документировано в
// комментарии — обращение к server-only полю (например `SENTRY_DSN` в root
// `env.ts`) из браузерного кода становится ошибкой ТАЙПЧЕКА (поля просто нет
// в типе), а не рантайм-сюрпризом при первом обращении к чему угодно.
type ViteKeys<Result> = Extract<keyof Result, `VITE_${string}`>;

/**
 * Browser-вариант — источник значений `import.meta.env` (Vite сам грузит
 * `.env`/реальные переменные окружения и подставляет их сюда как настоящий
 * объект в рантайме, не только статической заменой). Резолвится через
 * `package.json#exports` `"browser"` condition — её запрашивают bundler'ы
 * клиентского кода (Vite/esbuild по умолчанию для браузерных сборок).
 *
 * Только переменные с префиксом `VITE_` (или настроенным `envPrefix`) реально
 * видны в `import.meta.env` — это ограничение самого Vite, не этого файла.
 * Поэтому схема сужается до VITE_*-подмножества (`fullSchema.pick(...)`) ДО
 * валидации, а не валидируется целиком с расчётом на `.default()` у
 * остальных полей: `z.object.safeParse` — это один разбор всей схемы разом,
 * так что одно required server-only поле без дефолта (например `SENTRY_DSN`
 * в root `env.ts`, доступном отовсюду через `@monorepo`) роняло бы парсинг
 * ЦЕЛИКОМ, а с ним — доступ ко ВСЕМ полям сразу, включая те, что реально есть
 * в `import.meta.env` (проверено живьём на zod). "Вылечить" это дефолтом
 * нельзя — дефолт ослабил бы обязательность поля и на Node-стороне тоже (там
 * та же декларация используется `define-env.ts`, где эта переменная как раз
 * обязана быть заполнена по-настоящему). Правильный ответ — не валидировать
 * server-only поля в браузерном контексте вообще: для браузера их как будто
 * не существует, ровно как и в реальности (Vite их в `import.meta.env` не
 * кладёт).
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
): Pick<z.infer<z.ZodObject<Shape>>, ViteKeys<z.infer<z.ZodObject<Shape>>>> {
  const fullSchema = z.object(builder(z));
  const viteKeys = Object.keys(fullSchema.shape).filter((key) => key.startsWith('VITE_'));
  // Маска pick() строится из имён, известных только в рантайме (обычный
  // filter по строке) — zod требует литеральные ключи Shape прямо в типе
  // маски, что здесь принципиально невозможно выразить статически (сами
  // VITE_-ключи не известны на этапе тайпчека, разные вызовы defineEnv дают
  // разный Shape). Реальная корректность — за Result-типом функции
  // (Pick<..., ViteKeys<...>> выше), он проверен отдельно; этот `as never`
  // только снимает препятствие тайпчекера у самого вызова `.pick()`.
  const mask = Object.fromEntries(viteKeys.map((key) => [key, true]));
  const schema = fullSchema.pick(mask as never);
  type Result = Pick<z.infer<z.ZodObject<Shape>>, ViteKeys<z.infer<z.ZodObject<Shape>>>>;
  let cached: Result | undefined;

  function resolve(): Result {
    if (!cached) {
      const source = import.meta.env as unknown as Record<string, string | undefined>;
      const parsed = schema.safeParse(source);
      if (!parsed.success) {
        throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
      }
      cached = parsed.data as Result;
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
