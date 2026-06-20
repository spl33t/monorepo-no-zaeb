import { readFileSync } from 'node:fs'
import path from 'node:path'

export interface GetPortFromEnvOptions {
  /** Использовать process.cwd() вместо __dirname. @default true */
  useProcessCwd?: boolean
  /** Бросать исключение при ошибке. @default true */
  throwError?: boolean
}

/** Читает PORT из `.env` с валидацией. */
export function getPortFromEnv(options: GetPortFromEnvOptions = {}): number {
  const { useProcessCwd = true, throwError = true } = options

  const envPath = useProcessCwd
    ? path.resolve(process.cwd(), '.env')
    : path.resolve(__dirname, '.env')

  try {
    readFileSync(envPath, 'utf-8')
  } catch {
    if (throwError) {
      throw new Error(`❌ Файл .env не найден: ${envPath}`)
    }
    console.error(`❌ Файл .env не найден: ${envPath}`)
    process.exit(1)
  }

  const envContent = readFileSync(envPath, 'utf-8')
  const portMatch = envContent.match(/^PORT=(\d+)/m)

  if (!portMatch) {
    if (throwError) {
      throw new Error(`❌ Переменная PORT не найдена в файле .env: ${envPath}`)
    }
    console.error(`❌ Переменная PORT не найдена в файле .env: ${envPath}`)
    process.exit(1)
  }

  return parseInt(portMatch[1], 10)
}
