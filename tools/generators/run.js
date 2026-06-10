const fs = require('fs');
const path = require('path');

/**
 * Генерирует run.ts — dev/build оркестратор для Node.js приложений
 * @returns {string}
 */
function generateRunScript() {
  return fs.readFileSync(path.join(__dirname, 'node-run.template.ts'), 'utf-8');
}

module.exports = { generateRunScript };
