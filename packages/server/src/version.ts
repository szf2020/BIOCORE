// ============================================================
// version.ts — single source of truth for the displayed product version.
//
// Reads the monorepo root package.json (name === "biocore") once at module
// load by walking up from __dirname. Works in both tsx dev (running from
// packages/server/src/) and compiled prod (running from packages/server/dist/).
//
// v1.11.1: introduced because three sites previously used
// `process.env.npm_package_version ?? '<server-pkg-version>'` which (a) only
// resolves the SERVER package version (0.4.0), not the meaningful product
// version (1.11.0), and (b) fell out of date every release. This module
// removes the fallback string drift problem entirely.
// ============================================================

import { readFileSync } from 'fs';
import { dirname, join, parse } from 'path';

/** Hard-coded fallback if the walk fails (e.g., the file moves out of the workspace). */
const FALLBACK_VERSION = '0.0.0-unknown';

function findRootVersion(): string {
  let dir = __dirname;
  // Walk up to filesystem root. parse('/').root === '/' on POSIX, 'C:\' on Windows.
  const fsRoot = parse(dir).root;
  while (dir && dir !== fsRoot) {
    const pkgPath = join(dir, 'package.json');
    try {
      const raw = readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as { name?: string; version?: string };
      if (pkg.name === 'biocore' && typeof pkg.version === 'string') {
        return pkg.version;
      }
    } catch {
      // package.json missing or unreadable at this level; keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return FALLBACK_VERSION;
}

const _cached = findRootVersion();

/**
 * Monorepo root version (e.g., '1.11.0'). Read once at module load.
 * Use this for user-visible banners, /api/v1/status responses, and
 * runtime-guard service-version metadata so all three stay aligned.
 */
export const ROOT_VERSION: string = _cached;
