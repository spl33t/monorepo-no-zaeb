const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/index.js',
  packages: 'external',
  define: {
    'process.env.NODE_ENV': '"production"'
  }
}).catch(() => process.exit(1));
