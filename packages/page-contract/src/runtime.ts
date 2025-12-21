import type { PageFunction, PageInput, PageResult } from './types'

/**
 * Универсальный runtime-исполнитель PageFunction
 * 
 * Никаких if (server) / if (browser)
 * Только бизнес-результат
 * 
 * @param page - PageFunction для выполнения
 * @param input - Входные данные
 * @returns Результат выполнения (PageResult)
 */
export async function runPage(
  page: PageFunction,
  input: PageInput
): Promise<PageResult> {
  try {
    const result = await page(input)
    return result
  } catch (error) {
    return {
      type: 'error',
      error,
      status: 500
    }
  }
}


