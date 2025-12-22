import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@monorepo': path.resolve(__dirname, '../../packages')
    }
  },
  build: {
    rollupOptions: {
      // Для клиентской сборки используем src/client.tsx как точку входа
      // HTML генерируется на сервере, поэтому index.html не нужен
      input: {
        main: path.resolve(__dirname, 'src/client.tsx'),
      },
    },
  },
});
