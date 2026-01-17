const fs = require('fs');
const path = require('path');

/**
 * Генерирует специфичные файлы для Vanilla Vite приложения
 * @param {string} appDir - Директория приложения
 * @param {string} name - Название приложения
 */
function generateVanillaFiles(appDir, name) {
  // src/main.ts
  const mainTs = `import './style.css';

document.querySelector<HTMLDivElement>('#root')!.innerHTML = \`
  <div>
    <h1>🚀 ${name}</h1>
    <p>Vite + Vanilla TypeScript приложение</p>
    <p>📦 NODE_ENV: \${import.meta.env.MODE}</p>
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

#root {
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

  return {
    dependencies: {},
    devDependencies: {},
    scriptSrc: '/src/main.ts',
    structure: [
      '  ├── main.ts',
      '  ├── style.css',
      '  └── vite-env.d.ts'
    ]
  };
}

module.exports = { generateVanillaFiles };
