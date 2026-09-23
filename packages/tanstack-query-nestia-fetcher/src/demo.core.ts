// import type { IConnection } from "@nestia/fetcher";
// import { QueryClient } from "@tanstack/query-core";
// import { functional as appApi } from "@packages/nest-api-client";
// import { functional as humanApi } from "@packages/nest-api-client/human";
// import { createApiCore } from "./index";

// const connection: IConnection = {
//   host: "http://localhost:3000",
// };

// /**
//  * Ничего React-специфичного ниже — та же фабрика, что использует
//  * react.ts (createApiHooks зовёт ровно createApiCore внутри), но здесь
//  * без единого хука: годится для скрипта, воркера, серверного кода, любого
//  * не-React фреймворка со своим адаптером над @tanstack/query-core.
//  */
// const human = createApiCore({ connection, sdk: humanApi });
// const app = createApiCore({ connection, sdk: appApi });

// /** Без sdk — только явный вызов функцией из SDK, ни QueryClient, ни route-строк. */
// const raw = createApiCore({ connection });

// async function main() {
//   // === Просто вызов эндпоинта — Promise, без QueryClient вообще ===
//   const hello = await raw.callEndpoint(appApi.getHello, []);

//   // === Route-строка -> сырая функция SDK (тот же адрес, что у react.ts) ===
//   const getUsers = human.resolve("GET /users");
//   const users = await human.callEndpoint(getUsers, []);

//   // === Через QueryClient — кэш/дедупликация/инвалидация, ключ тот же,
//   // что использовал бы useSdkQuery("GET /users/:id", ...) в react.ts ===
//   const queryClient = new QueryClient();
//   const request = { params: { id: "1" } };

//   await human.prefetch(queryClient, "GET /users/:id", request);
//   const cached = queryClient.getQueryData(human.queryKey("GET /users/:id", request));

//   await human.invalidate(queryClient, "GET /users");
//   await human.reset(queryClient, "GET /users");

//   return { hello, users, cached };
// }
