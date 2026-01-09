#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
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
    const parsed = yaml.parse(content);
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
 * Преобразует JavaScript объект обратно в YAML строку
 * @param {Object} obj - Объект с services, networks, volumes
 * @returns {string} YAML строка
 */
function stringifyDockerCompose(obj) {
  const yamlObj = {};
  
  if (Object.keys(obj.services || {}).length > 0) {
    yamlObj.services = obj.services;
  }
  
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

// Если скрипт запущен напрямую, экспортируем функции
if (require.main === module) {
  const composePath = process.argv[2] || path.join(process.cwd(), 'docker-compose.yml');
  const result = parseDockerCompose(composePath);
  console.log(JSON.stringify(result, null, 2));
} else {
  module.exports = { parseDockerCompose, stringifyDockerCompose };
}

