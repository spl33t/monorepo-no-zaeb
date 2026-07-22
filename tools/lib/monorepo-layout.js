'use strict';

const fs = require('fs');
const path = require('path');

/** @typedef {'nestjs' | 'vite'} ToolchainId */

/**
 * Саб-монорепы: id → каталоги от корня git-репо.
 * packages/ — свободные папки с кодом (не npm workspace-пакеты).
 */
const TOOLCHAINS = /** @type {const} */ ({
  nestjs: {
    id: 'nestjs',
    root: 'nestjs-apps',
    appsRel: 'nestjs-apps/apps',
    packagesRel: 'nestjs-apps/packages',
  },
  vite: {
    id: 'vite',
    root: 'vite-apps',
    appsRel: 'vite-apps/apps',
    packagesRel: 'vite-apps/packages',
  },
});

const TOOLCHAIN_IDS = /** @type {ToolchainId[]} */ (['nestjs', 'vite']);

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
 * Гарантирует apps/ и packages/ в обоих тулчейнах (+ .gitkeep если пусто).
 * @param {string} [cwd]
 */
function ensureLayoutDirs(cwd) {
  const root = resolveRoot(cwd);
  for (const id of TOOLCHAIN_IDS) {
    const t = TOOLCHAINS[id];
    for (const rel of [t.appsRel, t.packagesRel]) {
      const abs = path.join(root, rel);
      fs.mkdirSync(abs, { recursive: true });
      const keep = path.join(abs, '.gitkeep');
      if (!fs.existsSync(keep) && fs.readdirSync(abs).length === 0) {
        fs.writeFileSync(keep, '');
      }
    }
  }
  return root;
}

/**
 * @param {ToolchainId} id
 * @param {string} [cwd]
 */
function appsDir(id, cwd) {
  return path.join(resolveRoot(cwd), toolchain(id).appsRel);
}

/**
 * @param {ToolchainId} id
 * @param {string} name
 * @param {string} [cwd]
 */
function appDir(id, name, cwd) {
  return path.join(appsDir(id, cwd), name);
}

/**
 * @param {ToolchainId} id
 * @param {string} name
 */
function appRelPosix(id, name) {
  return `${toolchain(id).appsRel}/${name}`.replace(/\\/g, '/');
}

/**
 * @param {string} [cwd]
 * @returns {Array<{ world: ToolchainId, name: string, absDir: string, relPosix: string }>}
 */
function listApps(cwd) {
  const root = resolveRoot(cwd);
  /** @type {Array<{ world: ToolchainId, name: string, absDir: string, relPosix: string }>} */
  const out = [];
  for (const id of TOOLCHAIN_IDS) {
    const dir = appsDir(id, root);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      out.push({
        world: id,
        name: entry.name,
        absDir: path.join(dir, entry.name),
        relPosix: appRelPosix(id, entry.name),
      });
    }
  }
  return out;
}

/**
 * @param {string} name
 * @param {string} [cwd]
 */
function findAppByName(name, cwd) {
  return listApps(cwd).find((a) => a.name === name) ?? null;
}

/**
 * @param {string} name
 * @param {string} [cwd]
 */
function appExists(name, cwd) {
  return Boolean(findAppByName(name, cwd));
}

/**
 * @param {ToolchainId} id
 * @param {string} frameworkName
 * @param {string} [cwd]
 */
function getDefaultAppName(id, frameworkName, cwd) {
  const dir = appsDir(id, cwd);
  if (!fs.existsSync(dir)) return frameworkName;

  if (!fs.existsSync(path.join(dir, frameworkName))) return frameworkName;

  let counter = 2;
  let appName = `${frameworkName}-${counter}`;
  while (fs.existsSync(path.join(dir, appName))) {
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
  TOOLCHAIN_IDS,
  /** @deprecated use TOOLCHAINS */
  APP_WORLDS: TOOLCHAINS,
  findMonorepoRoot,
  ensureLayoutDirs,
  appsDir,
  appDir,
  appRelPosix,
  listApps,
  findAppByName,
  appExists,
  getDefaultAppName,
  getUsedPorts,
};
