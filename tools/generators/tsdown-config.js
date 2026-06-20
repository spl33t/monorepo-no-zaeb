const { resolveMonorepoDistPaths } = require('../lib/monorepo-dist.ts')

/**
 * Генерирует tsdown.config.ts для Node.js приложений
 * @param {string} entryPath - Путь к entry (например, 'src/main.ts' или 'src/index.ts')
 * @param {string} appDir - Абсолютный путь к директории приложения
 * @returns {string}
 */
function generateTsdownConfig(entryPath, appDir) {
  return `import { defineConfig } from 'tsdown'
import ttsc from '@ttsc/unplugin/rolldown'
import { config as loadEnv } from 'dotenv'
import path from 'path'
import { resolveBuilderMode } from '../../tools/lib/builder-mode.ts'
import { getPortFromEnv } from '../../tools/lib/env-utils.ts'
import { resolveMonorepoDistPaths } from '../../tools/lib/monorepo-dist.ts'
import { devReadyPlugin } from '../../tools/plugins/dev-ready-plugin.ts'
import { runtimePackagesPlugin } from '../../tools/plugins/runtime-packages-plugin.ts'

loadEnv({ path: path.resolve(process.cwd(), '.env'), override: true })

const baseCfg = resolveBuilderMode({
  dev: { watch: true, clean: false, treeshake: false },
  prod: { watch: false, clean: true, treeshake: true },
})

const distPaths = resolveMonorepoDistPaths('${entryPath}')

export default defineConfig({
  entry: distPaths.entry,

  platform: 'node',
  format: ['cjs'],
  outDir: 'dist',

  dts: false,

  clean: baseCfg.clean,
  shims: false,
  treeshake: baseCfg.treeshake,
  sourcemap: true,
  watch: baseCfg.watch,

  skipNodeModulesBundle: true,
  unbundle: true,

  outputOptions: {
    preserveModulesRoot: distPaths.monorepoRoot,
  },

  env: {
    BUILDER_MODE: baseCfg.mode,
  },

  plugins: [ttsc(), runtimePackagesPlugin(), devReadyPlugin({ mode: baseCfg.mode })],

  hooks: {
    'build:prepare': async () => {
      getPortFromEnv()
    },
  },
})
`;
}

module.exports = { generateTsdownConfig };
