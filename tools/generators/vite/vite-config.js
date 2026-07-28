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

  return `import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
${reactImport}
/**
 * PORT из .env (cwd = каталог приложения при dev/build/preview), иначе
 * process.env.PORT, иначе дефолт. Не падает, если .env физически нет —
 * он намеренно в .dockerignore (не должен попадать в образ); для Docker
 * production (статика под nginx) значение вообще не используется, а
 * жёсткий throw ломал сборку без него. Для dev/preview реальный порт
 * приходит через docker-compose env_file/watch-sync или обычный .env локально.
 */
function portFromEnv(defaultPort: number): number {
  const envPath = path.resolve(process.cwd(), '.env');
  try {
    const content = readFileSync(envPath, 'utf8');
    const match = content.match(/^PORT=(\\d+)/m);
    if (match) return parseInt(match[1], 10);
  } catch {
    // .env отсутствует — см. комментарий выше.
  }
  return process.env.PORT ? parseInt(process.env.PORT, 10) : defaultPort;
}

const port = portFromEnv(5173);

export default defineConfig({
  server: { port, host: '0.0.0.0' },
  preview: { port, host: '0.0.0.0' },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },${plugins}
});
`;
}

module.exports = { generateViteConfig };
