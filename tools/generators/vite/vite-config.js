/**
 * Генерирует vite.config.ts для apps/<name> — полностью самодостаточный
 * (раньше импортировал extendsBaseConfig из tools/vite.config.base.ts; та
 * версия нарочно не трогала 'vite', т.к. tools/ был без своих deps — теперь
 * логика инлайнится прямо в app, у которого 'vite' и так свой devDependency,
 * so defineConfig — не лишний, даёт нормальную типизацию конфига).
 * @param {'react'|'vanilla'} framework
 */
function generateViteConfig(framework) {
  const reactImport = framework === 'react' ? `import react from '@vitejs/plugin-react';\n` : '';
  const plugins = framework === 'react' ? '\n  plugins: [react()],' : '';

  return `import path from 'node:path';
import { defineConfig } from 'vite';
import { env } from './env';
${reactImport}
// env.ts валидирует PORT через zod с .default(...) — safeParse никогда не
// бросает, даже при \`vite build\` в Docker (builder-стадия без .env, PORT
// в process.env не задан): тогда используется дефолт из схемы. Там, где
// PORT реально есть (dev/preview — инжектит workspace-env), используется
// он. vite.config.ts грузится Node'ом нативно (bare-специфайеры вроде
// @tools/workspace-env не бандлятся Vite'ом при загрузке конфига) — node-
// вариант defineEnv (tools/packages/workspace-env/src/define-env.ts)
// специально самодостаточен (без внутренних relative-импортов) именно
// ради этого случая.
const port = env.PORT;

export default defineConfig({
  server: { port, host: '0.0.0.0' },
  preview: { port, host: '0.0.0.0' },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      // Только для VITE_*-полей схемы env.ts (см. tsconfig.json#paths) —
      // резолвится Vite'ом в browser-вариант @tools/workspace-env
      // (import.meta.env), не в process.env.
      '@env': path.resolve(process.cwd(), 'env.ts'),
    },
  },${plugins}
});
`;
}

module.exports = { generateViteConfig };
