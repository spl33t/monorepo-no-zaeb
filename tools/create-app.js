#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

/**
 * Создает конфигурацию nodemon.json
 * @param {string} entryPoint - Путь к файлу запуска (например, 'src/index.ts' или 'src/main.ts')
 * @returns {object} Конфигурация nodemon
 */
function createNodemonConfig(entryPoint) {
  return {
    watch: ['src', '../../packages', '.env'],
    ext: 'ts,json,env',
    ignore: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    exec: `ts-node --transpile-only ${entryPoint}`,
    env: {
      NODE_ENV: 'development'
    }
  };
}

const APP_TYPES = [
  { key: 'nodejs', name: 'Node.js TypeScript приложение' },
  { key: 'nestjs', name: 'NestJS API сервер' },
  { key: 'vite', name: 'Vite приложение (React/Vanilla)' }
];

const VITE_FRAMEWORKS = [
  { key: 'react', name: 'React + TypeScript' },
  { key: 'vanilla', name: 'Vanilla HTML + TypeScript' }
];

async function createApp() {
  console.log('\n🚀 Создание нового приложения\n');

  // Выбор типа
  console.log('Выберите тип приложения:');
  APP_TYPES.forEach((type, index) => {
    console.log(`  ${index + 1}. ${type.name}`);
  });
  
  const choice = await question('\nВведите номер [по умолчанию: 1]: ') || '1';
  const typeIndex = parseInt(choice) - 1;
  
  if (typeIndex < 0 || typeIndex >= APP_TYPES.length) {
    console.error(`❌ Неверный выбор. Введите число от 1 до ${APP_TYPES.length}`);
    process.exit(1);
  }
  
  const type = APP_TYPES[typeIndex].key;

  // Дополнительные вопросы для Vite
  let viteFramework = 'react';
  if (type === 'vite') {
    console.log('\nВыберите фреймворк:');
    VITE_FRAMEWORKS.forEach((fw, index) => {
      console.log(`  ${index + 1}. ${fw.name}`);
    });
    
    const fwChoice = await question('\nВведите номер [по умолчанию: 1]: ') || '1';
    const fwIndex = parseInt(fwChoice) - 1;
    
    if (fwIndex < 0 || fwIndex >= VITE_FRAMEWORKS.length) {
      console.error(`❌ Неверный выбор. Введите число от 1 до ${VITE_FRAMEWORKS.length}`);
      process.exit(1);
    }
    
    viteFramework = VITE_FRAMEWORKS[fwIndex].key;
  }

  // Название
  const name = await question('\nНазвание приложения: ');
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    console.error('❌ Название должно содержать только a-z, 0-9, -');
    process.exit(1);
  }

  const appDir = path.join(process.cwd(), 'apps', name);
  
  if (fs.existsSync(appDir)) {
    console.error(`❌ Приложение "${name}" уже существует`);
    process.exit(1);
  }

  console.log(`\n📦 Создаю приложение "${name}" типа "${type}"...\n`);

  // Создаем структуру
  fs.mkdirSync(path.join(appDir, 'src'), { recursive: true });

  // package.json
  const packageJson = {
    name,
    version: '1.0.0',
    type: type === 'vite' ? 'module' : undefined,
    main: type === 'vite' ? undefined : './dist/index.js',
    scripts: {}
  };

  // Настраиваем scripts в зависимости от типа
  if (type === 'vite') {
    packageJson.scripts = {
      'dev': 'vite',
      'build': 'tsc && vite build',
      'preview': 'vite preview',
      'clean': 'rimraf dist'
    };
  } else {
    packageJson.scripts = {
      build: type === 'nestjs'
        ? 'esbuild src/main.ts --bundle --platform=node --outfile=dist/index.js --packages=external'
        : 'esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js',
      clean: 'rimraf dist',
      dev: type === 'nestjs' 
        ? 'nodemon --exec ts-node --transpile-only src/main.ts'
        : 'nodemon --exec ts-node --transpile-only src/index.ts',
      start: 'node dist/index.js'
    };
  }

  // Добавляем dependencies в зависимости от типа
  if (type === 'nestjs') {
    packageJson.dependencies = {
      '@nestjs/common': '^10.0.0',
      '@nestjs/core': '^10.0.0',
      '@nestjs/platform-express': '^10.0.0',
      'reflect-metadata': '^0.1.13',
      'rxjs': '^7.8.0'
    };
    packageJson.devDependencies = {
      '@nestjs/cli': '^10.0.0',
      '@nestjs/schematics': '^10.0.0'
    };
  } else if (type === 'vite') {
    if (viteFramework === 'react') {
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
      // Vanilla - только Vite
      packageJson.devDependencies = {
        'vite': '^5.0.0'
      };
    }
  }
  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // tsconfig.json
  const tsconfig = type === 'vite'
    ? {
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
          jsx: viteFramework === 'react' ? 'react-jsx' : 'preserve',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true
        },
        include: ['src']
      }
    : {
        extends: '../../tsconfig.json',
        compilerOptions: {
          outDir: './dist'
        },
        include: ['src/**/*']
      };
  
  fs.writeFileSync(
    path.join(appDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );

  // Создаем nodemon.json (только для nodejs/nestjs, не для vite)
  if (type !== 'vite') {
    const entryPoint = type === 'nestjs' ? 'src/main.ts' : 'src/index.ts';
    const nodemonConfig = createNodemonConfig(entryPoint);
    fs.writeFileSync(
      path.join(appDir, 'nodemon.json'),
      JSON.stringify(nodemonConfig, null, 2)
    );
  }

  // Создаем файлы в зависимости от типа
  if (type === 'vite') {
    // index.html
    const scriptSrc = viteFramework === 'react' ? '/src/main.tsx' : '/src/main.ts';
    const rootId = viteFramework === 'react' ? 'root' : 'app';
    
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
    if (viteFramework === 'react') {
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

    if (viteFramework === 'react') {
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

    } else if (viteFramework === 'vanilla') {
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
    
    // Создаем vite-env.d.ts (общий для всех Vite приложений)
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
    
    // Создаем .env.example для Vite приложений
    const envExample = `# Environment variables for Vite
# Copy this file to .env and set your values
# ВАЖНО: Только переменные с префиксом VITE_ доступны в клиентском коде

# VITE_API_URL=http://localhost:3000
# VITE_APP_TITLE=My App
`;
    fs.writeFileSync(path.join(appDir, '.env.example'), envExample);
  } else if (type === 'nodejs') {
    const indexContent = `#!/usr/bin/env node

import 'dotenv/config';

console.log('🚀 ${name} is running!');

// Пример функции
function main() {
  console.log('Hello from ${name}!');
}

main();
`;
    fs.writeFileSync(path.join(appDir, 'src/index.ts'), indexContent);
  } else if (type === 'nestjs') {
    // main.ts
    const mainContent = `import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(\`🚀 ${name} is running on: http://localhost:\${port}\`);
}

bootstrap();
`;
    fs.writeFileSync(path.join(appDir, 'src/main.ts'), mainContent);

    // app.module.ts
    const moduleContent = `import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`;
    fs.writeFileSync(path.join(appDir, 'src/app.module.ts'), moduleContent);

    // app.controller.ts
    const controllerContent = `import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
`;
    fs.writeFileSync(path.join(appDir, 'src/app.controller.ts'), controllerContent);

    // app.service.ts
    const serviceContent = `import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return '🚀 ${name} API is running!';
  }
}
`;
    fs.writeFileSync(path.join(appDir, 'src/app.service.ts'), serviceContent);
  }

  console.log('✅ Структура создана:');
  console.log(`   apps/${name}/`);
  
  if (type === 'vite') {
    console.log(`   ├── src/`);
    if (viteFramework === 'react') {
      console.log(`   │   ├── main.tsx`);
      console.log(`   │   ├── App.tsx`);
      console.log(`   │   └── index.css`);
    } else {
      console.log(`   │   ├── main.ts`);
      console.log(`   │   └── style.css`);
    }
    console.log(`   ├── index.html`);
    console.log(`   ├── vite.config.ts`);
    console.log(`   ├── package.json`);
    console.log(`   ├── tsconfig.json`);
    console.log(`   └── .env.example`);
  } else {
    console.log(`   ├── src/`);
    if (type === 'nestjs') {
      console.log(`   │   ├── main.ts`);
      console.log(`   │   ├── app.module.ts`);
      console.log(`   │   ├── app.controller.ts`);
      console.log(`   │   └── app.service.ts`);
    } else {
      console.log(`   │   └── index.ts`);
    }
    console.log(`   ├── package.json`);
    console.log(`   ├── tsconfig.json`);
    console.log(`   └── nodemon.json`);
    
    // Создаем .env.example для Node.js/NestJS
    if (type === 'nodejs' || type === 'nestjs') {
      const envExample = `# Environment variables
# Copy this file to .env and set your values

# PORT=3000
# NODE_ENV=development
`;
      fs.writeFileSync(path.join(appDir, '.env.example'), envExample);
      console.log(`   └── .env.example`);
    }
  }

  // Удаляем .gitkeep если он существует (больше не нужен после создания первого приложения)
  const gitkeepPath = path.join(process.cwd(), 'apps', '.gitkeep');
  if (fs.existsSync(gitkeepPath)) {
    fs.unlinkSync(gitkeepPath);
  }

  console.log('\n📝 Следующие шаги:');
  console.log(`   1. npm install`);
  console.log(`   2. npm run dev --workspace=${name}`);
  
  if (type === 'vite') {
    console.log(`   3. Открой http://localhost:5173`);
    console.log('\n💡 Доступные команды:');
    console.log(`   npm run dev --workspace=${name}       # Dev сервер`);
    console.log(`   npm run build --workspace=${name}     # Сборка`);
    console.log(`   npm run preview --workspace=${name}   # Превью сборки`);
    console.log('\n📝 Переменные окружения:');
    console.log(`   - Добавьте переменные с префиксом VITE_ в .env`);
    console.log(`   - Добавьте типы в src/vite-env.d.ts (примеры внутри)`);
    console.log(`   - Используйте: import.meta.env.VITE_YOUR_VAR`);
  } else if (type === 'nestjs') {
    console.log(`   3. Открой http://localhost:3000`);
    console.log('\n💡 Доступные команды:');
    console.log(`   npm run dev --workspace=${name}       # Dev режим`);
    console.log(`   npm run build --workspace=${name}     # Сборка`);
    console.log(`   npm run start --workspace=${name}     # Запуск собранного`);
  } else {
    console.log('\n💡 Доступные команды:');
    console.log(`   npm run dev --workspace=${name}       # Dev режим`);
    console.log(`   npm run build --workspace=${name}     # Сборка`);
    console.log(`   npm run start --workspace=${name}     # Запуск собранного`);
  }

  rl.close();
}

createApp().catch(err => {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});

