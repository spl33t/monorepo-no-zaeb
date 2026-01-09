const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/index.js',
  define: {
    'process.env.NODE_ENV': '"production"'
  }
}).catch(() => process.exit(1));
