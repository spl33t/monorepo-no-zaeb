/**
 * `.dockerignore` — общий для nest- и vite-генераторов шаблон (побайтово
 * одинаковый, было продублировано в обоих create-app.js, вынесено сюда).
 * @returns {string}
 */
function generateDockerignore() {
  return `node_modules\ndist\n.env\n.env.local\n*.log\n.DS_Store\n.git\n.gitignore\nREADME.md\n.vscode\n.idea\n`;
}

module.exports = { generateDockerignore };
