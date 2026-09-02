// import type { IConnection } from "@nestia/fetcher";
// import { functional as appApi } from "@packages/nest-api-client";
// import { functional as humanApi } from "@packages/nest-api-client/human";
// import { useQueryClient } from "@tanstack/react-query";
// import { createApiHooks } from "./wrapper";

// const connection: IConnection = {
//   host: "http://localhost:3000",
// };

// /**
//  * Одна фабрика — один сгенерированный Nestia-клиент (entry point). Для
//  * другого клиента (другой entry point) вызываем createApiHooks ещё раз —
//  * мерджа между несколькими sdk в одном вызове нет, решили осознанно (см.
//  * обсуждение в wrapper.ts).
//  */
// const app = createApiHooks({ connection, sdk: appApi });
// const human = createApiHooks({ connection, sdk: humanApi });

// /** Без sdk — только низкоуровневые хуки, ключ — сама функция из SDK. */
// const raw = createApiHooks({ connection });

// export function useTestApi() {
//   const queryClient = useQueryClient();

//   // === QUERY — именованные слоты { params, query, body } вместо позиционных args ===

//   // GET /users — без параметров вообще, request-объект не нужен
//   const users = human.useQuery("GET /users");

//   // GET /users/search — именованный query


//   const search = human.useQuery("GET /users/search", { query: { query: "ali", page: 1 } });

//   // GET /users/:id — именованный params
//   const one = human.useQuery("GET /users/:id", { params: { id: "1" } });

//   // GET /users/me — только headers; это часть connection (IConnection<Headers>),
//   // не аргумент функции, поэтому здесь тоже без request-объекта
//   const me = human.useQuery("GET /users/me");

//   // GET /users/:id/posts/:postId — ДВА path-параметра в одном params
//   const post = human.useQuery("GET /users/:id/posts/:postId", {
//     params: { id: "1", postId: "2" },
//   });

//   // GET /health — из другого entry point'а (app), фабрика вызвана отдельно
//   const health = app.useQuery("GET /health");

//   // === MUTATION — variables — тот же { params, query, body }, не позиционный tuple ===

//   // POST /users — только body
//   const createUser = human.useMutation("POST /users");
//   const onCreate = () => createUser.mutate({ body: { name: "carol" } });

//   // PATCH /users/:id — params + body в одном объекте
//   const updateUser = human.useMutation("PATCH /users/:id");
//   const onUpdate = () =>
//     updateUser.mutate({ params: { id: "1" }, body: { name: "carol updated" } });

//   // DELETE /users/:id — только params
//   const removeUser = human.useMutation("DELETE /users/:id");
//   const onRemove = () => removeUser.mutate({ params: { id: "1" } });

//   // PATCH /users/:id/posts/:postId — ДВА path-параметра + body одновременно
//   const updatePost = human.useMutation("PATCH /users/:id/posts/:postId");
//   const onUpdatePost = () =>
//     updatePost.mutate({ params: { id: "1", postId: "2" }, body: { name: "x" } });

//   // тайпчек ловит опечатки в роуте — раскомментируй, чтобы увидеть ошибку:
//   // human.useQuery("");                                    // пустая строка — не существующий route
//   // app.useQuery("GET /nope");                              // несуществующий путь
//   // app.useQuery("POST /health");                           // путь есть, метод не тот
//   // human.useMutation("GET /users");                        // GET — не мутация, useMutation её не примет
//   // human.useQuery("POST /users");                          // и наоборот — POST не query
//   // human.useQuery("GET /users/:id");                       // забыли params, хотя роут его требует
//   // human.useMutation("POST /users").mutate({ params: { id: "1" }, body: { name: "x" } }); // params лишний
//   //
//   // GET /users/filter — query раскидан на отдельные @Query('page')/@Query('search')
//   // поля, а не один DTO. RouteRequest не может разложить их в один { query },
//   // поэтому обычный вызов не собирается — только через raw.useApiQuery ниже:
//   // human.useQuery("GET /users/filter", { query: { page: 1, search: "x" } });
//   const filterViaRaw = raw.useApiQuery(humanApi.users.filter, [1, "x"]);

//   const invalidateUsers = () => human.invalidate(queryClient, "GET /users");

//   // --- та же логика явной функцией из SDK (когда sdk не передан) ---
//   const hello = raw.useApiQuery(appApi.getHello, []);

//   return {
//     users: users.data,
//     search: search.data,
//     one: one.data,
//     me: me.data,
//     post: post.data,
//     health: health.data,
//     hello: hello.data,
//     filterViaRaw: filterViaRaw.data,
//     onCreate,
//     onUpdate,
//     onRemove,
//     onUpdatePost,
//     invalidateUsers,
//     creating: createUser.isPending,
//     updating: updateUser.isPending,
//     removing: removeUser.isPending,
//     updatingPost: updatePost.isPending,
//   };
// }
