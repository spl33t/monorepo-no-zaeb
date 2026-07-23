import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, mergeConfig, type Plugin, type UserConfig } from 'vite';

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

function resolveUnder(base: string, subpath: string): string | undefined {
  const abs = path.join(base, subpath);
  for (const index of ['index.ts', 'index.tsx', 'index.js', 'index.mjs']) {
    const idx = path.join(abs, index);
    if (existsSync(idx)) return idx;
  }
  for (const ext of ['.ts', '.tsx', '.js', '.mjs', '.jsx']) {
    const file = abs + ext;
    if (existsSync(file)) return file;
  }
}

/**
 * @root-packages/foo → monorepo packages/foo
 * @toolchain-packages/foo → vite-apps/packages/foo
 */
function folderPackagesPlugin(appDir: string): Plugin {
  const rootPkgs = path.resolve(appDir, '../../../packages');
  const toolchainPkgs = path.resolve(appDir, '../../packages');

  return {
    name: 'folder-packages',
    resolveId(id) {
      if (id.startsWith('@root-packages/')) {
        return resolveUnder(rootPkgs, id.slice('@root-packages/'.length));
      }
      if (id.startsWith('@toolchain-packages/')) {
        return resolveUnder(toolchainPkgs, id.slice('@toolchain-packages/'.length));
      }
    },
  };
}

/** Общий vite-конфиг тулчейна. appDir — абсолютный путь к apps/<name>. */
function createViteBase(appDir: string): UserConfig {
  const port = portFromEnv();
  return {
    plugins: [folderPackagesPlugin(appDir)],
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
