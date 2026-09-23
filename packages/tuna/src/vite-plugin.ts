import type { Plugin } from 'vite';

/**
 * Правит server.hmr/server.allowedHosts (и preview.allowedHosts) под dev-туннель
 * `tuna` (публикует https://localhost:PORT под доменом вида
 * frontend-admin.dev.mv.dating, TLS на 443 → см. bin/tuna-start.js и
 * package.json#scripts.dev:tuna каждого app'а).
 *
 * Без server-части HMR-вебсокет ломается двумя независимыми способами:
 * 1. Клиент без явного clientPort берёт либо server.port (недоступен
 *    снаружи туннеля), либо (на дефолтном для https 443 — пустом)
 *    location.port — оба мимо цели.
 * 2. У Vite WS-апгрейд для HMR ходит через ОТДЕЛЬНУЮ от обычных HTTP
 *    проверку Host-заголовка, которая не отключается под mkcert/https
 *    (в отличие от общей) — без домена в allowedHosts апгрейд рвётся
 *    сервером до открытия соединения.
 *
 * У `vite preview` (статическая раздача собранного билда, HMR там нет) —
 * своя ОТДЕЛЬНАЯ, но той же природы Host-проверка (preview.allowedHosts),
 * тоже не отключается под https сама по себе — если раздавать превью через
 * тот же туннель, без домена в preview.allowedHosts запросы будут падать
 * с 403.
 *
 * Домен туннеля берётся только из process.env.TUNA_DOMAIN — без параметров,
 * без оверрайда. Плагину всё равно, чем переменная туда положена (в этой
 * монорепе обычно @tools/workspace-env, провалидировав её по env.ts app'а до
 * выполнения vite.config.ts, но годится и любой другой способ).
 *
 * Все оверрайды включаются вместе и только когда реально запущено через
 * туннель: `bin/tuna-start.js` выставляет __TUNA_START__=1 в env обёрнутой
 * команды (см. package.json#scripts.dev:tuna). Двойное подчёркивание с
 * обеих сторон — та же конвенция "зарезервировано инструментом", что у
 * __WORKSPACE_ENV__ в @tools/workspace-env (голое TUNA_START слишком похоже
 * на имя, которое кто-то мог бы дать своей переменной). Без него — обычный
 * `pnpm run dev`/`pnpm run preview` — конфиг не трогается.
 */
export function tuna(): Plugin {
  const isTunneled = !!process.env.__TUNA_START__;

  return {
    name: 'vite-plugin-tuna',
    config() {
      if (!isTunneled) return;

      const domain = process.env.TUNA_DOMAIN;
      if (!domain) {
        throw new Error('[vite-plugin-tuna] Домен туннеля не задан: process.env.TUNA_DOMAIN пуст.');
      }

      return {
        server: {
          allowedHosts: [domain],
          hmr: { protocol: 'wss', clientPort: 443 },
        },
        preview: {
          allowedHosts: [domain],
        },
      };
    },
  };
}
