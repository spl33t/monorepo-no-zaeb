/**
 * `env.ts` — общий для nest- и vite-генераторов шаблон (было продублировано
 * в обоих create-app.js, вынесено сюда). Дефолт PORT (nest: 3000, vite: 5173)
 * и опциональные доп. поля (например NODE_ENV у nest — см.
 * tools/generators/nest/create-app.js) передаются аргументами.
 *
 * `.default(defaultPort)` у PORT, а не голый `z.coerce.number()`: vite.config.ts
 * (в отличие от nest'овского main.ts, который всегда запускается только
 * через workspace-env-обёрнутые dev/start) читает env.ts и при `vite build` —
 * скрипт `build` НЕ обёрнут workspace-env (Docker builder-стадия не имеет
 * `.env`, он в .dockerignore, и порт для самого билда не нужен — server/
 * preview-конфиг в билде не участвует). Без default `safeParse` бросал бы
 * исключение при отсутствующем PORT и ронял `vite build` в Docker. С
 * default — там, где PORT реально задан (dev/preview, настоящий `.env`/
 * process.env), используется он; иначе — этот дефолт, парсинг не падает
 * никогда.
 * @param {number} defaultPort
 * @param {string[]} [extraFields] дополнительные строки схемы (без отступа,
 *   без завершающей запятой — добавляется автоматически)
 * @returns {string}
 */
function generateEnvTs(defaultPort, extraFields = []) {
  const fields = [`PORT: z.coerce.number().default(${defaultPort}),`, ...extraFields.map((f) => `${f},`)]
    .map((line) => `  ${line}`)
    .join('\n');

  return `import { defineEnv } from '@tools/workspace-env';

export const env = defineEnv((z) => ({
${fields}
}));

export default env;
`;
}

module.exports = { generateEnvTs };
