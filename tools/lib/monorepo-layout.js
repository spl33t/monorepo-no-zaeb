'use strict';

const fs = require('fs');
const path = require('path');

/** @typedef {'nestjs' | 'vite'} ToolchainId */

/**
 * Саб-монорепы: id → каталоги от корня git-репо.
 * packages/ — свободные папки (не npm workspace):
 *   root packages/ — isomorphic; toolchain packages/ — только тулчейн.
 */
const ROOT_PACKAGES_REL = 'packages';

const TOOLCHAINS = /** @type {const} */ ({
  nestjs: {
    root: 'nestjs-apps',
    appsRel: 'nestjs-apps/apps',
    packagesRel: 'nestjs-apps/packages',
  },
  vite: {
    root: 'vite-apps',
    appsRel: 'vite-apps/apps',
    packagesRel: 'vite-apps/packages',
  },
});

/** @type {ToolchainId[]} */
const TOOLCHAIN_IDS = Object.keys(TOOLCHAINS);

/**
 * Корень репо (есть nestjs-apps/, vite-apps/, tools/).
 * @param {string} [startDir]
 */
function findMonorepoRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (
      fs.existsSync(path.join(dir, 'nestjs-apps')) &&
      fs.existsSync(path.join(dir, 'vite-apps')) &&
      fs.existsSync(path.join(dir, 'tools'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Корень монорепо не найден от ${startDir} (ожидаются nestjs-apps/, vite-apps/, tools/)`,
      );
    }
    dir = parent;
  }
}

/** @param {string} [cwd] */
function resolveRoot(cwd) {
  return cwd ? path.resolve(cwd) : findMonorepoRoot();
}

/**
 * @param {ToolchainId} id
 */
function toolchain(id) {
  const t = TOOLCHAINS[id];
  if (!t) throw new Error(`Неизвестный тулчейн: ${id}`);
  return t;
}

/**
 * Гарантирует root packages/ + apps/packages в обоих тулчейнах (+ .gitkeep если пусто).
 * @param {string} [cwd]
 */
function ensureLayoutDirs(cwd) {
  const root = resolveRoot(cwd);
  const dirs = [
    ROOT_PACKAGES_REL,
    ...TOOLCHAIN_IDS.flatMap((id) => {
      const t = TOOLCHAINS[id];
      return [t.appsRel, t.packagesRel];
    }),
  ];
  for (const rel of dirs) {
    const abs = path.join(root, rel);
    fs.mkdirSync(abs, { recursive: true });
    const keep = path.join(abs, '.gitkeep');
    if (!fs.existsSync(keep) && fs.readdirSync(abs).length === 0) {
      fs.writeFileSync(keep, '');
    }
  }
  return root;
}

/**
 * @param {ToolchainId} id
 * @param {string} name
 * @param {string} [cwd]
 * @returns {{ toolchain: ToolchainId, name: string, absDir: string, relPosix: string }}
 */
function resolveApp(id, name, cwd) {
  const root = resolveRoot(cwd);
  const t = toolchain(id);
  return {
    toolchain: id,
    name,
    absDir: path.join(root, t.appsRel, name),
    relPosix: `${t.appsRel}/${name}`.replace(/\\/g, '/'),
  };
}

/**
 * @param {string} [cwd]
 * @returns {Array<{ toolchain: ToolchainId, name: string, absDir: string, relPosix: string }>}
 */
function listApps(cwd) {
  const root = resolveRoot(cwd);
  /** @type {Array<{ toolchain: ToolchainId, name: string, absDir: string, relPosix: string }>} */
  const out = [];
  for (const id of TOOLCHAIN_IDS) {
    const appsPath = path.join(root, toolchain(id).appsRel);
    if (!fs.existsSync(appsPath)) continue;
    for (const entry of fs.readdirSync(appsPath, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      out.push(resolveApp(id, entry.name, root));
    }
  }
  return out;
}

/**
 * Имя сервиса / container в docker-compose: nestjs-api, vite-web, …
 * @param {ToolchainId} id
 * @param {string} name
 */
function composeServiceName(id, name) {
  return `${id}-${name}`;
}

/**
 * Найти app по folder-name. При нескольких совпадениях — ошибка (нужен toolchain).
 * @param {string} name
 * @param {string} [cwd]
 * @param {ToolchainId} [id]
 */
function findAppByName(name, cwd, id) {
  const matches = listApps(cwd).filter(
    (a) => a.name === name && (id == null || a.toolchain === id),
  );
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(
      `Несколько apps с именем "${name}" (${matches.map((m) => m.toolchain).join(', ')}). Укажи тулчейн.`,
    );
  }
  return matches[0];
}

/**
 * @param {ToolchainId} id
 * @param {string} frameworkName
 * @param {string} [cwd]
 */
function getDefaultAppName(id, frameworkName, cwd) {
  const root = resolveRoot(cwd);
  const appsPath = path.join(root, toolchain(id).appsRel);
  if (!fs.existsSync(appsPath) || !fs.existsSync(path.join(appsPath, frameworkName))) {
    return frameworkName;
  }

  let counter = 2;
  let appName = `${frameworkName}-${counter}`;
  while (fs.existsSync(path.join(appsPath, appName))) {
    counter++;
    appName = `${frameworkName}-${counter}`;
  }
  return appName;
}

/**
 * Порты из .env приложений и host-портов docker-compose.yml.
 * @param {string} [cwd]
 */
function getUsedPorts(cwd) {
  const root = resolveRoot(cwd);
  const usedPorts = new Set();

  for (const app of listApps(root)) {
    const envPath = path.join(app.absDir, '.env');
    if (!fs.existsSync(envPath)) continue;
    const portMatch = fs.readFileSync(envPath, 'utf8').match(/^PORT\s*=\s*(\d+)/m);
    if (portMatch) usedPorts.add(parseInt(portMatch[1], 10));
  }

  const composePath = path.join(root, 'docker-compose.yml');
  if (fs.existsSync(composePath)) {
    try {
      const composeContent = fs.readFileSync(composePath, 'utf8');
      for (const match of composeContent.matchAll(/^\s*-\s*["']?(\d+):\d+/gm)) {
        usedPorts.add(parseInt(match[1], 10));
      }
    } catch {
      // ignore
    }
  }

  return usedPorts;
}

module.exports = {
  TOOLCHAINS,
  ROOT_PACKAGES_REL,
  findMonorepoRoot,
  ensureLayoutDirs,
  resolveApp,
  listApps,
  composeServiceName,
  findAppByName,
  getDefaultAppName,
  getUsedPorts,
};
