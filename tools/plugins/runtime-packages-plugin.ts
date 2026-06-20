import fs from 'node:fs'
import path from 'node:path'

export interface RuntimePackagesPluginOptions {
  distDir?: string
  packagesDir?: string
}

export function runtimePackagesPlugin(
  options: RuntimePackagesPluginOptions = {},
) {
  const distDir = path.resolve(options.distDir ?? 'dist')
  const packagesDir = path.resolve(
    options.packagesDir ?? path.join(process.cwd(), '../../packages'),
  )

  return {
    name: 'runtime-packages',

    async writeBundle() {
      const distPackagesDir = path.join(distDir, 'packages')

      if (!fs.existsSync(distPackagesDir)) {
        return
      }

      const entries = await fs.promises.readdir(distPackagesDir, {
        withFileTypes: true,
      })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const packageName = entry.name
        const distPackagePath = path.join(distPackagesDir, packageName)
        const sourcePackagePath = path.join(packagesDir, packageName)

        await ensureNodeModulesLink(sourcePackagePath, distPackagePath)
      }
    },
  }
}

async function ensureNodeModulesLink(
  sourcePackagePath: string,
  distPackagePath: string,
): Promise<void> {
  const sourceNodeModules = path.join(sourcePackagePath, 'node_modules')

  if (!fs.existsSync(sourceNodeModules)) {
    return
  }

  const distNodeModules = path.join(distPackagePath, 'node_modules')

  if (fs.existsSync(distNodeModules)) {
    return
  }

  await fs.promises.mkdir(distPackagePath, { recursive: true })

  await fs.promises.symlink(
    path.relative(distPackagePath, sourceNodeModules),
    distNodeModules,
    process.platform === 'win32' ? 'junction' : 'dir',
  )
}
