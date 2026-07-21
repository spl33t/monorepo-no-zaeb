import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { findMonorepoRoot } from "./findMonorepoRoot";

type LinkSpec = { linkPath: string; target: string };

/**
 * Under app `dist/`, find dirs that mirror a workspace package
 * (`<monorepoRoot>/<rel>/package.json`) and junction/symlink
 * `dist/<rel>/node_modules` → that package's `node_modules`.
 *
 * Works for any mirrored folder (packages/*, libs/*, …), not only `packages/`.
 */
function collectNodeModuleLinks(distDir: string, monorepoRoot: string): LinkSpec[] {
  const links: LinkSpec[] = [];

  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name === "node_modules") continue;
      const full = path.join(dir, ent.name);
      const rel = path.relative(distDir, full);
      const pkgJson = path.join(monorepoRoot, rel, "package.json");
      const srcNodeModules = path.join(monorepoRoot, rel, "node_modules");

      if (existsSync(pkgJson) && existsSync(srcNodeModules)) {
        links.push({
          linkPath: path.join(full, "node_modules"),
          target: srcNodeModules,
        });
      }

      walk(full);
    }
  };

  walk(distDir);
  return links;
}

function sameLinkTarget(linkPath: string, absTarget: string): boolean {
  try {
    const st = lstatSync(linkPath);
    if (st.isSymbolicLink()) {
      const raw = readlinkSync(linkPath);
      const resolved = path.resolve(path.dirname(linkPath), raw);
      return resolved === absTarget;
    }
    // Junction on Windows may appear as directory; compare realpath via readlink when possible
    if (st.isDirectory()) {
      try {
        const raw = readlinkSync(linkPath);
        return path.resolve(path.dirname(linkPath), raw) === absTarget;
      } catch {
        return false;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function ensureNodeModulesLink(linkPath: string, target: string): void {
  const absTarget = path.resolve(target);

  if (sameLinkTarget(linkPath, absTarget)) return;

  try {
    rmSync(linkPath, { recursive: true, force: true });
  } catch {
    // absent is fine
  }

  mkdirSync(path.dirname(linkPath), { recursive: true });
  const type = process.platform === "win32" ? "junction" : "dir";
  symlinkSync(absTarget, linkPath, type);
}

/**
 * After ttsc emit: link each mirrored package's node_modules into dist
 * so bare requires use the same isolated deps as the source package.
 */
export function linkDistPackageNodeModules(appCwd = process.cwd()): number {
  const distDir = path.join(appCwd, "dist");
  if (!existsSync(distDir)) return 0;

  const monorepoRoot = findMonorepoRoot(appCwd);
  const links = collectNodeModuleLinks(distDir, monorepoRoot);

  for (const { linkPath, target } of links) {
    ensureNodeModulesLink(linkPath, target);
  }

  return links.length;
}
