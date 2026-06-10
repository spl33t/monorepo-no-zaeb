const { generateGetPortFromEnvFunction } = require('./env-utils');

/**
 * Генерирует tsdown.config.ts для Node.js приложений
 * @param {string} entryPath - Путь к entry (например, 'src/main.ts' или 'src/index.ts')
 * @returns {string}
 */
function generateTsdownConfig(entryPath) {
  const getPortFromEnvCode = generateGetPortFromEnvFunction({
    useProcessCwd: true,
    throwError: true,
  });

  return `import { defineConfig } from 'tsdown'
import path from 'path'
import { readFileSync } from 'fs'

/** Режим сборщика tsdown. Не путать с NODE_ENV рантайма. */
export type BuilderMode = 'dev' | 'prod'

const BUILDER_MODE_VALUES: BuilderMode[] = ['dev', 'prod']

export const builderModeConfig: Record<
  BuilderMode,
  { watch: boolean; clean: boolean; treeshake: boolean }
> = {
  dev: { watch: true, clean: false, treeshake: false },
  prod: { watch: false, clean: true, treeshake: true },
}

const args = process.argv.slice(2)
const BUILDER_MODE_FLAG = '--builder-mode='

function parseBuilderModeFlag(value: string): BuilderMode {
  if (BUILDER_MODE_VALUES.includes(value as BuilderMode)) {
    return value as BuilderMode
  }
  throw new Error(\`tsdown: invalid --builder-mode=\${value}, use dev or prod\`)
}

export function resolveBuilderMode(argv = args): BuilderMode {
  const hasDev = argv.includes('--dev')
  const hasProd = argv.includes('--prod')

  if (hasDev && hasProd) {
    throw new Error('tsdown: use either --dev or --prod, not both')
  }
  if (hasDev) return 'dev'
  if (hasProd) return 'prod'

  const flag = argv.find((arg) => arg.startsWith(BUILDER_MODE_FLAG))
  if (flag) return parseBuilderModeFlag(flag.slice(BUILDER_MODE_FLAG.length))

  const fromEnv = process.env.BUILDER_MODE ?? process.env.builderMode
  if (fromEnv) return parseBuilderModeFlag(fromEnv)

  throw new Error(
    'tsdown: set builder mode via --dev, --prod, --builder-mode=dev|prod, or BUILDER_MODE=dev|prod',
  )
}

/** PORT из .env — проверяем до сборки (см. hooks). */
${getPortFromEnvCode}

const builderMode = resolveBuilderMode()
const mode = builderModeConfig[builderMode]

export default defineConfig({
  entry: {
    index: '${entryPath}',
  },

  platform: 'node',
  format: ['cjs'],
  outDir: 'dist',

  dts: false,

  clean: mode.clean,
  shims: false,
  treeshake: mode.treeshake,
  sourcemap: true,
  watch: mode.watch,

  skipNodeModulesBundle: true,
  unbundle: true,

  env: {
    BUILDER_MODE: builderMode,
  },

  hooks: {
    'build:prepare': async () => {
      getPortFromEnv()
    },
  },
})
`;
}

module.exports = { generateTsdownConfig };
