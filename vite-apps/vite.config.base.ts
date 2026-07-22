import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, mergeConfig, type UserConfig } from 'vite';

/** PORT из apps/<name>/.env (cwd = каталог приложения). */
function portFromEnv(): number {
  const envPath = path.resolve(process.cwd(), '.env');
  let content: string;
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    throw new Error(`.env не найден: ${envPath}`);
  }
  const match = content.match(/^PORT=(\d+)/m);
  if (!match) throw new Error(`PORT не найден в ${envPath}`);
  return parseInt(match[1], 10);
}

/** Общий vite-конфиг тулчейна. appDir — абсолютный путь к apps/<name>. */
function createViteBase(appDir: string): UserConfig {
  const port = portFromEnv();
  return {
    server: {
      port,
      host: '0.0.0.0',
    },
    preview: {
      port,
      host: '0.0.0.0',
    },
    resolve: {
      alias: {
        '@': path.resolve(appDir, 'src'),
        '@monorepo': path.resolve(appDir, '../../packages'),
      },
    },
  };
}

/**
 * Конфиг приложения: cwd должен быть apps/<name>
 * (npm run -w / Docker WORKDIR). import.meta.url не нужен.
 */
export function extendsBaseConfig(overrides: UserConfig = {}) {
  return defineConfig(mergeConfig(createViteBase(process.cwd()), overrides));
}
