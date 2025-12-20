/**
 * Извлекает параметры из URL на основе паттерна маршрута
 * 
 * @param pattern - Паттерн маршрута (например, '/profile/:id')
 * @param url - URL для парсинга
 * @returns Объект с параметрами
 */
export function extractParams(pattern: string, url: string): Record<string, string> {
  const params: Record<string, string> = {}
  
  // Убираем query string из URL
  const urlPath = url.split('?')[0]
  
  // Разбиваем паттерн и URL на сегменты (фильтруем пустые строки)
  const patternParts = pattern.split('/').filter(Boolean)
  const urlParts = urlPath.split('/').filter(Boolean)
  
  // Проверяем, что количество сегментов совпадает (или URL длиннее для catch-all)
  if (urlParts.length < patternParts.length) {
    return params
  }
  
  patternParts.forEach((part, index) => {
    if (part.startsWith(':')) {
      const paramName = part.slice(1)
      const paramValue = urlParts[index]
      if (paramValue !== undefined) {
        params[paramName] = decodeURIComponent(paramValue)
      }
    }
  })
  
  return params
}

/**
 * Парсит query string из URL
 * 
 * @param url - URL с query string
 * @returns Объект с query параметрами
 */
export function parseQuery(url: string): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {}
  
  const queryString = url.split('?')[1]
  if (!queryString) {
    return query
  }
  
  const params = new URLSearchParams(queryString)
  
  for (const [key, value] of params.entries()) {
    if (query[key]) {
      // Если уже есть значение, делаем массив
      const existing = query[key]
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        query[key] = [existing, value]
      }
    } else {
      query[key] = value
    }
  }
  
  return query
}

