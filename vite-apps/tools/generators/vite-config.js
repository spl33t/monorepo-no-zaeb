/**
 * Генерирует vite.config.ts для apps/<name> — extendsBaseConfig из тулчейна.
 * @param {string} framework - 'react' | 'vanilla'
 */
function generateViteConfig(framework) {
  if (framework === 'react') {
    return `import react from '@vitejs/plugin-react';
import { extendsBaseConfig } from '../../vite.config.base.ts';

export default extendsBaseConfig({
  plugins: [react()],
});
`;
  }

  return `import { extendsBaseConfig } from '../../vite.config.base.ts';

export default extendsBaseConfig();
`;
}

module.exports = { generateViteConfig };
