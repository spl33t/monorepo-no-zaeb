import path from 'path';
import { defineConfig, loadConfigFromFile } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Плагин для сборки dist при каждом hot-reload
function buildOnChange(): Plugin {
  let buildTimeout: NodeJS.Timeout | null = null;
  let isBuilding = false;
  let pendingBuild = false;
  let viteConfig: any = null;

  const triggerBuild = async () => {
    if (isBuilding) {
      pendingBuild = true;
      return;
    }

    isBuilding = true;
    pendingBuild = false;

    try {
      // Динамически импортируем build для избежания циклических зависимостей
      const { build } = await import('vite');
      
      // Запускаем сборку
      await build({
        configFile: path.resolve(__dirname, 'vite.config.ts'),
        build: {
          outDir: 'dist',
          emptyOutDir: false, // Не очищаем dist для инкрементальной сборки
          minify: false, // Отключаем минификацию для быстрой сборки в dev
          sourcemap: true,
        },
        logLevel: 'warn', // Меньше логов
      });

      console.log('✅ [build-on-change] Сборка завершена');
    } catch (error: any) {
      // Игнорируем ошибки, связанные с уже запущенным dev сервером
      if (error?.message && !error.message.includes('EADDRINUSE')) {
        console.error('❌ [build-on-change] Ошибка сборки:', error.message);
      }
    } finally {
      isBuilding = false;
      
      // Если была отложенная сборка, запускаем её
      if (pendingBuild) {
        setTimeout(triggerBuild, 100);
      }
    }
  };

  return {
    name: 'build-on-change',
    async configResolved(config) {
      viteConfig = config;
    },
    configureServer(server) {
      // Запускаем первую сборку при старте
      server.httpServer?.once('listening', () => {
        console.log('📦 [build-on-change] Запуск первой сборки...');
        // Небольшая задержка чтобы dev сервер точно запустился
        setTimeout(triggerBuild, 500);
      });
    },
    handleHotUpdate({ file }) {
      // Debounce: собираем изменения за 500ms для батчинга
      if (buildTimeout) {
        clearTimeout(buildTimeout);
      }

      buildTimeout = setTimeout(() => {
        const fileName = path.relative(path.resolve(__dirname), file);
        console.log(`🔄 [build-on-change] Изменен файл: ${fileName}`);
        triggerBuild();
      }, 500);

      // Не блокируем стандартный HMR
      return undefined;
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    buildOnChange(),
  ],
  resolve: {
    alias: {
      '@monorepo': path.resolve(__dirname, '../../packages')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
