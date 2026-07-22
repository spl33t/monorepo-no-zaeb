/**
 * Nest app tsconfig — mirror emit от корня тулчейна.
 * rootDir: ../.. фиксирует dist/apps/<name>/src/... даже без импортов из packages.
 * В dist попадают только реально импортированные packages.
 */
function generateNodeTsconfig(_options = {}) {
  return {
    extends: '../../tsconfig.json',
    compilerOptions: {
      rootDir: '../..',
      outDir: 'dist',
      noEmit: false,
      sourceMap: true,
      declaration: false,
      paths: {
        '@/*': ['./src/*'],
        '@monorepo/*': ['../../packages/*'],
      },
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  };
}

module.exports = { generateNodeTsconfig };
