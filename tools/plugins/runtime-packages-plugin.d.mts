export interface RuntimePackagesPluginOptions {
  distDir?: string
  packagesDir?: string
}

export function runtimePackagesPlugin(
  options?: RuntimePackagesPluginOptions,
): import('rolldown').Plugin
