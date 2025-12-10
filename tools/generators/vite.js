const fs = require('fs');
const path = require('path');

/**
 * Генератор для Vite приложения (React или Vanilla)
 * @param {string} appDir - Директория приложения
 * @param {string} name - Название приложения
 * @param {string} framework - 'react' или 'vanilla'
 */
function createViteApp(appDir, name, framework) {
  // package.json
  const packageJson = {
    name,
    version: '1.0.0',
    type: 'module',
    scripts: {
      'dev': 'vite',
      'build': 'tsc && vite build',
      'preview': 'vite preview',
      'clean': 'rimraf dist',
      '--------------------------------Docker commands--------------------------------': '',
      'docker:build': `node ../../tools/docker-helper.js build Dockerfile ${name}`,
      'docker:up': `node ../../tools/docker-helper.js up Dockerfile ${name} 80 -d`,
      'docker:up:attach': `node ../../tools/docker-helper.js up Dockerfile ${name} 80`,
      'docker:attach': `docker attach ${name}`,
      'docker:down': `node ../../tools/docker-helper.js down ${name}`,
      'docker:logs': `docker logs -f ${name}`
    }
  };

  if (framework === 'react') {
    packageJson.dependencies = {
      'react': '^18.2.0',
      'react-dom': '^18.2.0'
    };
    packageJson.devDependencies = {
      '@vitejs/plugin-react': '^4.2.0',
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      'vite': '^5.0.0'
    };
  } else {
    // Vanilla
    packageJson.devDependencies = {
      'vite': '^5.0.0'
    };
  }

  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // tsconfig.json
  const tsconfig = {
    extends: '../../tsconfig.json',
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: framework === 'react' ? 'react-jsx' : 'preserve',
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true
    },
    include: ['src']
  };
  fs.writeFileSync(
    path.join(appDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );

  // index.html
  const scriptSrc = framework === 'react' ? '/src/main.tsx' : '/src/main.ts';
  const rootId = framework === 'react' ? 'root' : 'app';
  
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="${rootId}"></div>
    <script type="module" src="${scriptSrc}"></script>
  </body>
</html>
`;
  fs.writeFileSync(path.join(appDir, 'index.html'), indexHtml);

  // vite.config.ts
  let viteConfig = '';
  if (framework === 'react') {
    viteConfig = `import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@monorepo': path.resolve(__dirname, '../../packages')
    }
  }
});
`;
  } else {
    // Vanilla
    viteConfig = `import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@monorepo': path.resolve(__dirname, '../../packages')
    }
  }
});
`;
  }
  fs.writeFileSync(path.join(appDir, 'vite.config.ts'), viteConfig);

  // Создаем файлы в зависимости от фреймворка
  if (framework === 'react') {
    // src/main.tsx
    const mainTsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
    fs.writeFileSync(path.join(appDir, 'src/main.tsx'), mainTsx);

    // src/App.tsx
    const appTsx = `import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>🚀 ${name}</h1>
      <p>Vite + React приложение</p>
      <button onClick={() => setCount((count) => count + 1)}>
        count is {count}
      </button>
    </div>
  );
}

export default App;
`;
    fs.writeFileSync(path.join(appDir, 'src/App.tsx'), appTsx);

    // src/index.css
    const indexCss = `body {
  margin: 0;
  padding: 0;
  font-family: system-ui, -apple-system, sans-serif;
}

#root {
  min-height: 100vh;
}
`;
    fs.writeFileSync(path.join(appDir, 'src/index.css'), indexCss);

  } else {
    // Vanilla
    // src/main.ts
    const mainTs = `import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = \`
  <div>
    <h1>🚀 ${name}</h1>
    <p>Vite + Vanilla TypeScript приложение</p>
    <button id="counter" type="button">Count: 0</button>
  </div>
\`;

const button = document.querySelector<HTMLButtonElement>('#counter')!;
let count = 0;

button.addEventListener('click', () => {
  count++;
  button.textContent = \`Count: \${count}\`;
});
`;
    fs.writeFileSync(path.join(appDir, 'src/main.ts'), mainTs);

    // src/style.css
    const styleCss = `body {
  margin: 0;
  padding: 2rem;
  font-family: system-ui, -apple-system, sans-serif;
}

#app {
  max-width: 1200px;
  margin: 0 auto;
}

button {
  padding: 0.5rem 1rem;
  font-size: 1rem;
  cursor: pointer;
}
`;
    fs.writeFileSync(path.join(appDir, 'src/style.css'), styleCss);
  }
  
  // vite-env.d.ts (общий для всех Vite приложений)
  const viteEnv = `/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Примеры переменных окружения (раскомментируйте и добавьте свои):
  //readonly VITE_API_URL?: string;
  //readonly VITE_APP_TITLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv & Record<string, string | undefined>;
}
`;
  fs.writeFileSync(path.join(appDir, 'src/vite-env.d.ts'), viteEnv);
  
  // .env.example
  const envExample = `# Environment variables for Vite
# Copy this file to .env and set your values
# ВАЖНО: Только переменные с префиксом VITE_ доступны в клиентском коде

# VITE_API_URL=http://localhost:3000
# VITE_APP_TITLE=My App
`;
  fs.writeFileSync(path.join(appDir, '.env.example'), envExample);

  // Dockerfile для Vite (multi-stage: build + nginx)
  const dockerfile = `# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy workspace configuration
COPY apps/${name}/package.json ./apps/${name}/
COPY packages ./packages/

# Install dependencies
RUN npm install

# Copy source code
COPY apps/${name} ./apps/${name}/

# Build application
WORKDIR /app/apps/${name}
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/apps/${name}/dist /usr/share/nginx/html

# Copy nginx configuration (optional - for SPA routing)
RUN echo 'server { \\
    listen 80; \\
    server_name _; \\
    root /usr/share/nginx/html; \\
    index index.html; \\
    location / { \\
        try_files $uri $uri/ /index.html; \\
    } \\
}' > /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
`;
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), dockerfile);

  // .dockerignore
  const dockerignore = `node_modules
dist
.env
.env.local
*.log
.DS_Store
.git
.gitignore
README.md
.vscode
.idea
`;
  fs.writeFileSync(path.join(appDir, '.dockerignore'), dockerignore);

  // Формируем структуру для вывода
  const structure = [
    'src/'
  ];
  
  if (framework === 'react') {
    structure.push('  ├── main.tsx');
    structure.push('  ├── App.tsx');
    structure.push('  ├── index.css');
    structure.push('  └── vite-env.d.ts');
  } else {
    structure.push('  ├── main.ts');
    structure.push('  ├── style.css');
    structure.push('  └── vite-env.d.ts');
  }
  
  structure.push('index.html');
  structure.push('vite.config.ts');
  structure.push('package.json');
  structure.push('tsconfig.json');
  structure.push('.env.example');
  structure.push('Dockerfile');
  structure.push('.dockerignore');

  return {
    structure,
    commands: [
      `npm run dev --workspace=${name}       # Dev сервер`,
      `npm run build --workspace=${name}     # Сборка`,
      `npm run preview --workspace=${name}   # Превью сборки`
    ],
    dockerCommands: [
      `npm run docker:build                 # Сборка образа (без запуска)`,
      `npm run docker:up                    # Сборка + запуск (фоновый режим)`,
      `npm run docker:up:attach             # Сборка + запуск с выводом логов`,
      `npm run docker:attach                # Подключение к запущенному контейнеру`,
      `npm run docker:down                  # Остановка и удаление контейнера`,
      `npm run docker:logs                  # Просмотр логов`
    ],
    nextSteps: [
      'Открой http://localhost:5173'
    ],
    envInfo: [
      'Переменные окружения:',
      '- Добавьте переменные с префиксом VITE_ в .env',
      '- Добавьте типы в src/vite-env.d.ts (примеры внутри)',
      '- Используйте: import.meta.env.VITE_YOUR_VAR'
    ]
  };
}

module.exports = { createViteApp };

