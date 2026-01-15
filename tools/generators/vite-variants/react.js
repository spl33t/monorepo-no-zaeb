const fs = require('fs');
const path = require('path');

/**
 * Генерирует специфичные файлы для React Vite приложения
 * @param {string} appDir - Директория приложения
 * @param {string} name - Название приложения
 */
function generateReactFiles(appDir, name) {
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
      <p>📦 NODE_ENV: {import.meta.env.MODE}</p>
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

  return {
    dependencies: {
      'react': '^18.2.0',
      'react-dom': '^18.2.0'
    },
    devDependencies: {
      '@vitejs/plugin-react': '^4.2.0',
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      'vite': '^5.0.0'
    },
    scriptSrc: '/src/main.tsx',
    rootId: 'root',
    structure: [
      '  ├── main.tsx',
      '  ├── App.tsx',
      '  ├── index.css',
      '  └── vite-env.d.ts'
    ]
  };
}

module.exports = { generateReactFiles };
