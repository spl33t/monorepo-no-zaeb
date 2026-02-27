const { generateGetPortFromEnvFunction } = require('./env-utils');

/**
 * Генерирует tsdown.config.ts для Node.js приложений
 * @param {string} entryPath - Путь к entry файлу (например, 'src/main.ts' для NestJS или 'src/index.ts' для Node.js)
 * @returns {string} Содержимое tsdown.config.ts файла
 */
function generateTsdownConfig(entryPath) {
  const getPortFromEnvCode = generateGetPortFromEnvFunction({
    useProcessCwd: true,
    throwError: true // Используем исключения для единообразия
  });

  return `import { defineConfig } from 'tsdown';
import path from 'path';
import { readFileSync } from 'fs';
import typescript from '@rollup/plugin-typescript';

${getPortFromEnvCode}

// Проверяем аргументы командной строки
const args = process.argv.slice(2);
const isDev = args.includes('--dev') || args.includes('dev') || process.env.NODE_ENV === 'development';

let nodemonInstance: import('nodemon').Nodemon | null = null;
let typeCheckScheduled = false;

// Функция для проверки доступности приложения через HTTP ping
async function waitForAppReady(port: number, maxAttempts = 30, delay = 500): Promise<boolean> {
  const http = await import('http');

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            hostname: 'localhost',
            port,
            path: '/health',
            method: 'GET',
            timeout: 1000,
          },
          (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              reject(new Error(\`Status: \${res.statusCode}\`));
            }
          }
        );

        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Timeout'));
        });

        req.end();
      });

      return true; // Приложение готово
    } catch (error) {
      // Приложение ещё не готово, ждём
      await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

  return false; // Приложение не запустилось за отведённое время
}

// Функция проверки типов TypeScript
async function checkTypeScript() {
  if (typeCheckScheduled) return;
  typeCheckScheduled = true;

  const { execSync } = await import('child_process');
  try {
    execSync('tsc --noEmit --pretty', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    // Если ошибок нет - ничего не выводим
  } catch (error) {
    // Ошибки уже выведены через stdio: 'inherit'
    if (!isDev) {
      // В production прерываем процесс при ошибках типов
      process.exit(1);
    }
    // В dev режиме продолжаем работу, ошибки уже выведены
  } finally {
    typeCheckScheduled = false;
  }
}

export default defineConfig({
  entry: {
    index: '${entryPath}',
  },
  platform: 'node',
  format: ['cjs'],
  outDir: 'dist',
  dts: false,
  clean: !isDev, // Не очищаем dist в dev режиме для инкрементальной сборки
  shims: false,
  treeshake: true,
  sourcemap: true, // Включаем sourcemap в dev и production режимах
  watch: isDev, // Включаем watch режим при наличии аргумента dev
  plugins: [
    typescript({
      incremental: isDev,
      tsconfig: './tsconfig.json',
      filterRoot: path.resolve(process.cwd(), '../..'),
    }),
  ],
  skipNodeModulesBundle: true,
  unbundle: true,
  env: {
    NODE_ENV: isDev ? 'development' : 'production',
  },
  hooks: {
    "build:prepare": async (ctx) => {
      if (!isDev) {
        getPortFromEnv(); // Проверяем порт в production
        await checkTypeScript();
      }
    },
    'build:done': async () => {
      if (isDev && !nodemonInstance) {
        // Запускаем nodemon программно после первой сборки
        const nodemon = (await import('nodemon')).default;

        nodemonInstance = nodemon({
          script: path.join(process.cwd(), 'dist', 'index.cjs'),
          watch: ['dist', '.env'],
          legacyWatch: true,
          ext: 'cjs',
          ignore: ['dist/**/*.spec.js', 'dist/**/*.test.js'],
          delay: 500, // Задержка перед перезапуском
          env: {
            NODE_OPTIONS: '--enable-source-maps',
          },
        });

        nodemonInstance
          .on('start', async () => {
            console.log('Nodemon started');

            // Получаем порт из .env файла с валидацией
            // В dev режиме не завершаем процесс при ошибке, а ждём исправления
            let port: number | null = null;
            try {
              port = getPortFromEnv();
            } catch (error) {
              console.error('⚠️  Ошибка чтения PORT из .env:', error instanceof Error ? error.message : String(error));
              console.log('⏳ Ожидаю исправления .env файла...');
              return; // Пропускаем проверку готовности и проверку типов
            }

            // Ждём, пока приложение запустится и ответит на HTTP ping
            if (port !== null) {
              const isReady = await waitForAppReady(port);
              if (isReady) {
                // Проверяем типы после того, как приложение запустилось
                // Ошибки выводятся автоматически через stdio: 'inherit'
                await checkTypeScript();
              }
            }
          })
          .on('restart', async () => {
            console.log('Nodemon restarted');
          })
          .on('crash', () => {
            console.log('Application crashed. Nodemon will restart it before fixing the error');
          });

        // Функция очистки dist при завершении dev режима
        const cleanup = async () => {
          if (nodemonInstance) {
            nodemonInstance.emit('quit');
          }
          
          // Удаляем dist после завершения dev режима
          try {
            const { rmSync } = await import('fs');
            const distPath = path.join(process.cwd(), 'dist');
            rmSync(distPath, { recursive: true, force: true });
          } catch (error) {
            // Игнорируем ошибки, если dist уже удалён или не существует
          }
          
          process.exit(0);
        };

        // Обработка завершения процесса
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
      }
    },
  },
});
`;
}

module.exports = { generateTsdownConfig };
