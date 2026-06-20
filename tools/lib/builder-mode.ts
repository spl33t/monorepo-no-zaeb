import type { UserConfig } from 'tsdown'

/** Режим сборщика tsdown. Не путать с NODE_ENV рантайма. */
export type BuilderMode = 'dev' | 'prod'

const BUILDER_MODE_VALUES: BuilderMode[] = ['dev', 'prod']
const BUILDER_MODE_FLAG = '--builder-mode='

export type BuilderModeMap<T> = Record<BuilderMode, T>

export type ResolvedBuilderMode = UserConfig & { mode: BuilderMode }

function parseBuilderModeFlag(value: string): BuilderMode {
  if (BUILDER_MODE_VALUES.includes(value as BuilderMode)) {
    return value as BuilderMode
  }
  throw new Error(`tsdown: invalid --builder-mode=${value}, use dev or prod`)
}

function detectBuilderMode(argv: string[]): BuilderMode {
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

/** Выбирает фрагмент UserConfig по текущему builder mode (argv / BUILDER_MODE). */
export function resolveBuilderMode(
  configs: BuilderModeMap<UserConfig>,
  argv: string[] = process.argv.slice(2),
): ResolvedBuilderMode {
  const mode = detectBuilderMode(argv)
  return { ...configs[mode], mode }
}
