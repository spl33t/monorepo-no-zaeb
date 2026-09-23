import type { IConnection } from "@nestia/fetcher";

/** Сигнатура любой функции из Nestia SDK */
export type NestiaEndpoint<TArgs extends readonly unknown[], TOut> = (
  connection: IConnection,
  ...args: TArgs
) => Promise<TOut>;

export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/**
 * Разворачивает вложенный namespace сгенерированного Nestia SDK (functional)
 * в плоскую карту "МЕТОД /путь" -> сама функция-эндпоинт. METADATA у каждого
 * эндпоинта объявлена как `as const`, поэтому method/path — литеральные типы,
 * не просто string — отсюда и автокомплит валидных route-строк, и ошибка
 * типов на несуществующий путь/метод (проверено живьём на реальном
 * сгенерированном packages/nest-api-client).
 */
export type FlattenRoutes<T> = T extends NestiaEndpoint<any, any>
  ? T extends {
      METADATA: { method: infer M extends string; path: infer P extends string };
    }
    ? { [K in `${M} ${P}`]: T }
    : {}
  : T extends object
    ? UnionToIntersection<{ [K in keyof T]: FlattenRoutes<T[K]> }[keyof T]>
    : {};

export type RouteArgs<T> = T extends (connection: IConnection, ...args: infer A) => any ? A : never;
export type RouteOutput<T> = T extends (...args: any[]) => Promise<infer O> ? O : never;

// точное сравнение типов (не extends в одну сторону, а "совпадает ровно")
export type IsExactly<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

/**
 * Headers, которые ХОТЯ БЫ один роут в SDK просит через @TypedHeaders()
 * (IConnection<Headers> на его connection-параметре). Дефолтный
 * IConnection<object | undefined> (роуты без @TypedHeaders()) исключается —
 * иначе он бы "засорял" пересечение ниже.
 */
export type ConnectionHeadersOf<T> = T extends (connection: IConnection<infer H>, ...args: any[]) => any
  ? IsExactly<H, object | undefined> extends true
    ? never
    : H
  : T extends object
    ? { [K in keyof T]: ConnectionHeadersOf<T[K]> }[keyof T]
    : never;

/**
 * Headers-тип connection'а, выведенный из ВСЕХ роутов конкретного sdk — не
 * enforcement (у самого nestia Headerify делает все поля опциональными, так
 * что заставить нельзя, проверено живьём), а просто автокомплит: пишешь
 * connection.headers = { — IDE подскажет "authorization", если хоть один
 * роут в sdk просит его через @TypedHeaders().
 */
export type RawConnectionHeaders<TSdk> = [ConnectionHeadersOf<TSdk>] extends [never]
  ? object | undefined
  : UnionToIntersection<ConnectionHeadersOf<TSdk>>;

// TS не может абстрактно доказать (без конкретного TSdk), что
// RawConnectionHeaders<TSdk> лежит в constraint'е IConnection (object |
// undefined) — хотя по построению это всегда так. Стандартный приём: обернуть
// в T extends object|undefined ? T : fallback, это TS доказывает для любого T.
export type ConnectionHeaders<TSdk> = RawConnectionHeaders<TSdk> extends object | undefined
  ? RawConnectionHeaders<TSdk>
  : object | undefined;

/**
 * Имена path-параметров из строки пути, ПО ПОРЯДКУ (":id" -> "id"). Порядок
 * важен — он должен совпадать с порядком первых N элементов RouteArgs
 * (nestia генерирует path-параметры именно в таком порядке, ДО query/body).
 */
export type PathParamTuple<P extends string> = P extends `${string}:${infer Param}/${infer Rest}`
  ? [Param, ...PathParamTuple<`/${Rest}`>]
  : P extends `${string}:${infer Param}`
    ? [Param]
    : [];

export type PathOf<K extends string> = K extends `${string} ${infer P}` ? P : never;

/** Разбивает tuple на "первые N" и "остальное". */
export type SplitAt<
  T extends readonly unknown[],
  N extends number,
  Acc extends readonly unknown[] = [],
> = Acc["length"] extends N
  ? [Acc, T]
  : T extends readonly [infer Head, ...infer Tail]
    ? SplitAt<Tail, N, [...Acc, Head]>
    : [Acc, T];

/** Склеивает упорядоченные имена ("id") с упорядоченными значениями (string) в { id: string }. */
export type ZipNames<Names extends readonly string[], Values extends readonly unknown[]> =
  Names extends readonly [infer N extends string, ...infer NR extends readonly string[]]
    ? Values extends readonly [infer V, ...infer VR extends readonly unknown[]]
      ? { [K in N]: V } & ZipNames<NR, VR>
      : {}
    : {};

export type HasBody<T> = T extends { METADATA: { request: null } } ? false : true;

/**
 * Branded-заглушка для роутов, которые {params, query, body} разложить
 * однозначно не может (2+ "лишних" аргумента сверх path-параметров — это
 * значит query/headers раскиданы на отдельные @Query()/@Headers() поля, а не
 * один целый DTO). Специально не просто `never` — сообщение видно прямо в
 * ошибке компиляции ("Property '...' is missing"), а не голое "not never".
 * headers НЕ участвуют в подсчёте: у nestia это часть connection (через
 * IConnection<Headers>), а не отдельный аргумент функции — проверено живьём
 * на сгенерированном коде (@TypedHeaders() не добавляет параметр функции).
 */
export type UnsupportedRoute = {
  readonly UNSUPPORTED_ROUTE_use_useApiQuery_or_useApiMutation_with_positional_args: true;
};

/** Собирает { params?, query?, body? } под конкретный route-key K. */
export type RouteRequest<Routes, K extends keyof Routes & string> =
  PathParamTuple<PathOf<K>> extends infer PNames extends readonly string[]
    ? SplitAt<RouteArgs<Routes[K]>, PNames["length"]> extends [
        infer ParamValues extends readonly unknown[],
        infer Rest extends readonly unknown[],
      ]
      ? Rest["length"] extends 0
        ? ParamsSlot<PNames, ParamValues>
        : Rest["length"] extends 1
          ? ParamsSlot<PNames, ParamValues> &
              (HasBody<Routes[K]> extends true ? { body: Rest[0] } : { query: Rest[0] })
          : UnsupportedRoute
      : UnsupportedRoute
    : UnsupportedRoute;

export type ParamsSlot<Names extends readonly string[], Values extends readonly unknown[]> =
  Names["length"] extends 0 ? {} : { params: ZipNames<Names, Values> };

export type IsEmptyRequest<T> = keyof T extends never ? true : false;
