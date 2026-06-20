import fs from 'node:fs'
import path from 'node:path'

import type { BuilderMode } from '../lib/builder-mode.ts'

export interface DevReadyPluginOptions {
  mode: BuilderMode
  distDir?: string
  /** Имя файла-метки в dist; node-run следит за mtime. */
  readyFile?: string
}

/** Метка готовности dev-сборки — node-run перезапускает node при изменении mtime. */
export function devReadyPlugin(options: DevReadyPluginOptions) {
  const distDir = path.resolve(options.distDir ?? 'dist')
  const readyFile = path.join(distDir, options.readyFile ?? '.ready')

  return {
    name: 'dev-ready',

    async writeBundle() {
      if (options.mode !== 'dev') return

      await fs.promises.mkdir(path.dirname(readyFile), { recursive: true })
      await fs.promises.writeFile(readyFile, Date.now().toString())
    },
  }
}
