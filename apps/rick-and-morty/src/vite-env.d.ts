/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Примеры переменных окружения (раскомментируйте и добавьте свои):
  //readonly VITE_API_URL?: string;
  //readonly VITE_APP_TITLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv & Record<string, string | undefined>;
}
