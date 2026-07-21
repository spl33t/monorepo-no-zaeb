import path from 'node:path'

export interface MonorepoDistPaths {
  monorepoRoot: string
  appDir: string
  entryKey: string
  main: string
  entry: Record<string, string>
}

/** Пути dist, зеркалирующие структуру монорепы (apps/*, packages/*). */
export function resolveMonorepoDistPaths(
  entryPath: string,
  cwd = process.cwd(),
  emitExt: 'js' | 'cjs' = 'js',
): MonorepoDistPaths {
  const monorepoRoot = path.resolve(cwd, '../..')
  const appDir = path.relative(monorepoRoot, cwd).replace(/\\/g, '/')
  const entryRel = entryPath.replace(/\\/g, '/').replace(/\.[^.]+$/, '')
  const entryKey = `${appDir}/${entryRel}`

  return {
    monorepoRoot,
    appDir,
    entryKey,
    main: `./dist/${entryKey}.${emitExt}`,
    entry: { [entryKey]: entryPath },
  }
}
