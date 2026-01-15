import { defineConfig } from 'tsdown';
import path from 'path';
import { readFileSync } from 'fs';

// Читаем PORT из .env файла с валидацией
function getPortFromEnv(): number {
  // Используем process.cwd() для получения рабочей директории (ES модули)
  const envPath = path.resolve(process.cwd(), '.env');

  // Проверяем существование файла
  try {
    readFileSync(envPath, 'utf-8');
  } catch (error) {
    console.error(`❌ Файл .env не найден: ${envPath}`);
    process.exit(1);
  }

  // Читаем содержимое файла
  const envContent = readFileSync(envPath, 'utf-8');
  const portMatch = envContent.match(/^PORT=(\d+)/m);

  if (!portMatch) {
    console.error(`❌ Переменная PORT не найдена в файле .env: ${envPath}`);
    process.exit(1);
  }

  return parseInt(portMatch[1], 10);
}

// Проверяем аргументы командной строки
const args = process.argv.slice(2);
const isDev = args.includes('--dev') || args.includes('dev') || process.env.NODE_ENV === 'development';

let nodemonInstance: any = null;
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
              reject(new Error(`Status: ${res.statusCode}`));
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
    execSync('tsc --noEmit', {
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
    index: 'src/main.ts',
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
  env: {
    NODE_ENV: isDev ? 'development' : 'production',
  },
  hooks: {
    "build:prepare": async (ctx) => {
      if (!isDev) {
        getPortFromEnv();
        await checkTypeScript();
      } 
    },
    'build:done': async () => {
      if (isDev && !nodemonInstance) {
        // Запускаем nodemon программно после первой сборки
        const nodemon = (await import('nodemon')).default;

        // Получаем порт из .env файла с валидацией
        let port = getPortFromEnv();

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
            console.log('🚀 Nodemon запущен');

            port = getPortFromEnv();

            // Ждём, пока приложение запустится и ответит на HTTP ping
            const isReady = await waitForAppReady(port);
            if (isReady) {
              // Проверяем типы после того, как приложение запустилось
              // Ошибки выводятся автоматически через stdio: 'inherit'
              await checkTypeScript();
            }
          })
          .on('restart', async (files: string[]) => {
            console.log('🔄 Перезапуск nodemon из-за изменений:', files);
          })
          .on('crash', () => {
            console.log('❌ Приложение упало, nodemon перезапустит его');
          });

        // Обработка завершения процесса
        process.on('SIGINT', () => {
          if (nodemonInstance) {
            nodemonInstance.emit('quit');
          }
          process.exit(0);
        });

        process.on('SIGTERM', () => {
          if (nodemonInstance) {
            nodemonInstance.emit('quit');
          }
          process.exit(0);
        });
      }
    },
  },
});
