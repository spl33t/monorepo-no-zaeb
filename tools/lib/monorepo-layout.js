'use strict';

const fs = require('fs');
const path = require('path');

/** @typedef {'nest' | 'vite'} AppKind */

const APPS_REL = 'apps';
const PACKAGES_REL = 'packages';

/**
 * Корень репо (есть apps/, tools/).
 * @param {string} [startDir]
 */
function findMonorepoRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, APPS_REL)) && fs.existsSync(path.join(dir, 'tools'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Корень монорепо не найден от ${startDir} (ожидаются apps/, tools/)`);
    }
    dir = parent;
  }
}

/** @param {string} [cwd] */
function resolveRoot(cwd) {
  return cwd ? path.resolve(cwd) : findMonorepoRoot();
}

/**
 * Гарантирует apps/ + packages/ (+ .gitkeep если пусто).
 * @param {string} [cwd]
 */
function ensureLayoutDirs(cwd) {
  const root = resolveRoot(cwd);
  for (const rel of [APPS_REL, PACKAGES_REL]) {
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
 * Тип app'а — из package.json → monorepo.kind (не из расположения папки).
 * @param {string} absDir
 * @returns {AppKind | null}
 */
function readAppKind(absDir) {
  const pkgPath = path.join(absDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.monorepo?.kind || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} [cwd]
 * @returns {Array<{ kind: AppKind, name: string, absDir: string, relPosix: string }>}
 */
function listApps(cwd) {
  const root = resolveRoot(cwd);
  const appsPath = path.join(root, APPS_REL);
  /** @type {Array<{ kind: AppKind, name: string, absDir: string, relPosix: string }>} */
  const out = [];
  if (!fs.existsSync(appsPath)) return out;
  for (const entry of fs.readdirSync(appsPath, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const absDir = path.join(appsPath, entry.name);
    const kind = readAppKind(absDir);
    if (!kind) continue;
    out.push({ kind, name: entry.name, absDir, relPosix: `${APPS_REL}/${entry.name}` });
  }
  return out;
}

/**
 * Имя сервиса / container в docker-compose: nest-api, vite-web, …
 * @param {AppKind} kind
 * @param {string} name
 */
function composeServiceName(kind, name) {
  return `${kind}-${name}`;
}

/**
 * Найти app по folder-name. При нескольких совпадениях — ошибка (нужен kind).
 * @param {string} name
 * @param {string} [cwd]
 * @param {AppKind} [kind]
 */
function findAppByName(name, cwd, kind) {
  const matches = listApps(cwd).filter(
    (a) => a.name === name && (kind == null || a.kind === kind),
  );
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(
      `Несколько apps с именем "${name}" (${matches.map((m) => m.kind).join(', ')}). Укажи kind.`,
    );
  }
  return matches[0];
}

/**
 * @param {string} frameworkName
 * @param {string} [cwd]
 */
function getDefaultAppName(frameworkName, cwd) {
  const root = resolveRoot(cwd);
  const appsPath = path.join(root, APPS_REL);
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
 * @param {string} [cwd]
 * @returns {Array<{ name: string, absDir: string, relPosix: string }>}
 */
function listPackages(cwd) {
  const root = resolveRoot(cwd);
  const packagesPath = path.join(root, PACKAGES_REL);
  const out = [];
  if (!fs.existsSync(packagesPath)) return out;
  for (const entry of fs.readdirSync(packagesPath, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const absDir = path.join(packagesPath, entry.name);
    if (!fs.existsSync(path.join(absDir, 'package.json'))) continue;
    out.push({ name: entry.name, absDir, relPosix: `${PACKAGES_REL}/${entry.name}` });
  }
  return out;
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
  APPS_REL,
  PACKAGES_REL,
  findMonorepoRoot,
  ensureLayoutDirs,
  listApps,
  listPackages,
  composeServiceName,
  findAppByName,
  getDefaultAppName,
  getUsedPorts,
};
