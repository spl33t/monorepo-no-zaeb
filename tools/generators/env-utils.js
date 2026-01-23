/**
 * Утилиты для работы с переменными окружения
 */

/**
 * Генерирует код функции для чтения PORT из .env файла
 * @param {Object} options - Опции генерации
 * @param {boolean} options.useProcessCwd - Использовать process.cwd() вместо __dirname (по умолчанию true)
 * @param {boolean} options.throwError - Бросать исключение при ошибке (по умолчанию true)
 * @returns {string} Код функции getPortFromEnv
 */
function generateGetPortFromEnvFunction(options = {}) {
  const {
    useProcessCwd = true,
    throwError = true
  } = options;

  const envPathCode = useProcessCwd 
    ? `path.resolve(process.cwd(), '.env')`
    : `path.resolve(__dirname, '.env')`;

  const errorHandling = throwError
    ? `throw new Error(\`❌ Файл .env не найден: \${envPath}\`);`
    : `console.error(\`❌ Файл .env не найден: \${envPath}\`);
    process.exit(1);`;

  const portErrorHandling = throwError
    ? `throw new Error(\`❌ Переменная PORT не найдена в файле .env: \${envPath}\`);`
    : `console.error(\`❌ Переменная PORT не найдена в файле .env: \${envPath}\`);
    process.exit(1);`;

  return `// Читаем PORT из .env файла с валидацией
function getPortFromEnv(): number {
  const envPath = ${envPathCode};
  
  // Проверяем существование файла
  try {
    readFileSync(envPath, 'utf-8');
  } catch (error) {
    ${errorHandling}
  }
  
  // Читаем содержимое файла
  const envContent = readFileSync(envPath, 'utf-8');
  const portMatch = envContent.match(/^PORT=(\\d+)/m);
  
  if (!portMatch) {
    ${portErrorHandling}
  }
  
  return parseInt(portMatch[1], 10);
}`;
}

module.exports = { generateGetPortFromEnvFunction };
