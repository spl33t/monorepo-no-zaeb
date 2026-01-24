const { generateGetPortFromEnvFunction } = require('./env-utils');

/**
 * Генерирует vite.config.ts для Vite приложений
 * @param {string} framework - 'react' или 'vanilla'
 * @returns {string} Содержимое vite.config.ts файла
 */
function generateViteConfig(framework) {
  const reactPluginImport = framework === 'react' ? "import react from '@vitejs/plugin-react';\n" : '';
  const reactPlugin = framework === 'react' ? '  plugins: [react()],\n' : '';

  const getPortFromEnvCode = generateGetPortFromEnvFunction({
    useProcessCwd: true, // Используем process.cwd() вместо __dirname для совместимости с ESM
    throwError: true // Бросаем исключение для Vite конфига
  });

  return `import path from 'path';
import { defineConfig } from 'vite';
${reactPluginImport}import { readFileSync } from 'fs';

${getPortFromEnvCode}

export default defineConfig({
${reactPlugin}  server: {
    port: getPortFromEnv(),
    host: '0.0.0.0',
  },
  preview: {
    port: getPortFromEnv(),
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@monorepo': path.resolve(__dirname, '../../packages')
    }
  }
});
`;
}

module.exports = { generateViteConfig };
