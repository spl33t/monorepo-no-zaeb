const fs = require('fs');
const yaml = require('yaml');

/**
 * Парсит docker-compose.yml файл в JavaScript объект
 * @param {string} composePath - Путь к docker-compose.yml файлу
 * @returns {Object} Объект с services, networks, volumes
 */
function parseDockerCompose(composePath) {
  if (!fs.existsSync(composePath)) {
    return { services: {}, networks: {}, volumes: {} };
  }

  const content = fs.readFileSync(composePath, 'utf8');
  try {
    // Пустой/только-комментарии файл — yaml.parse даёт null, не {} (проверено
    // живьём) — без guard'а следующая строка падает на null.services.
    const parsed = yaml.parse(content) || {};
    return {
      services: parsed.services || {},
      networks: parsed.networks || {},
      volumes: parsed.volumes || {}
    };
  } catch (error) {
    throw new Error(`Ошибка при парсинге docker-compose.yml: ${error.message}`);
  }
}

/**
 * Преобразует JavaScript объект обратно в YAML строку. `services` — ВСЕГДА
 * в выводе, даже пустой ({}): `docker compose` считает файл без ключа
 * `services` (голый `{}`) невалидным — "empty compose file" (проверено
 * живьём) — а `services: {}` он ест нормально. Раньше `services` условно
 * пропускался при отсутствии сервисов — после удаления последнего app'а
 * файл превращался в `{}` и ломал вообще все `docker compose`-команды.
 * @param {Object} obj - Объект с services, networks, volumes
 * @returns {string} YAML строка
 */
function stringifyDockerCompose(obj) {
  const yamlObj = { services: obj.services || {} };

  if (Object.keys(obj.networks || {}).length > 0) {
    yamlObj.networks = obj.networks;
  }

  if (Object.keys(obj.volumes || {}).length > 0) {
    yamlObj.volumes = obj.volumes;
  }

  return yaml.stringify(yamlObj, {
    indent: 2,
    lineWidth: 0,
    minContentWidth: 0
  });
}

module.exports = { parseDockerCompose, stringifyDockerCompose };

