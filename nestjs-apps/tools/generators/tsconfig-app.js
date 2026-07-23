/**
 * Thin Nest app tsconfig.
 * rootDir = monorepo root → emit dist/nestjs-apps/... и dist/packages/...
 * @root-packages/*     → monorepo packages/ (isomorphic)
 * @toolchain-packages/* → nestjs-apps/packages/
 */
function generateNodeTsconfig(_options = {}) {
  return {
    extends: '../../tsconfig.json',
    compilerOptions: {
      rootDir: '../../..',
      outDir: 'dist',
      noEmit: false,
      paths: {
        '@/*': ['./src/*'],
        '@root-packages/*': ['../../../packages/*'],
        '@toolchain-packages/*': ['../../packages/*'],
      },
    },
    include: ['src'],
  };
}

module.exports = { generateNodeTsconfig };
