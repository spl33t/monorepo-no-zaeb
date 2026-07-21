/**
 * Генерирует tsconfig.json для Node.js приложений (IDE + ttsc emit через --emit).
 */
function generateNodeTsconfig() {
  return {
    extends: '../../tsconfig.json',
    compilerOptions: {
      rootDir: '../..',
      outDir: 'dist',
      noEmit: true,
      module: 'Node16',
      moduleResolution: 'node16',
      sourceMap: true,
      declaration: false,
      paths: {
        '@/*': ['./src/*'],
        '@monorepo/*': ['../../packages/*/src'],
      },
      plugins: [{ transform: '@ttsc/paths' }],
    },
    include: ['src/**/*'],
  };
}

module.exports = { generateNodeTsconfig };
