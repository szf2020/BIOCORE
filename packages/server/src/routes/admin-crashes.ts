// ============================================================
// admin-crashes.ts — runtime-guard diagnostic dump access (T38, Sprint 4 Track A)
//
// /api/v1/admin/crashes/*
//   GET /         list dumps {count, dumps: [{ts, name}]}        admin only
//   GET /:name    read single dump JSON; 404 if not found        admin only
//
// Path traversal: :name is sanitized via path.basename() and must end .json.
//
// 见: docs/superpowers/specs/2026-05-01-nodejs-hardening-design.md (T38)
// ============================================================
import { Router, type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { listDiagnosticDumps, readDiagnosticDump } from '@biocore/runtime-guard';

/**
 * Build the /admin/crashes router.
 *
 *   GET /         list dumps {count, dumps: [{ts, name}]}
 *   GET /:name    read single dump JSON; 404 if not found
 *
 * Path traversal: :name is sanitized via path.basename() and must end .json.
 */
export function createAdminCrashesRouter(crashesDir: string): Router {
  const r = Router();

  r.get('/', requireAdmin, (_req: Request, res: Response) => {
    const list = listDiagnosticDumps(crashesDir);
    res.json({
      count: list.length,
      dumps: list.map(d => ({ ts: d.ts, name: path.basename(d.path) })),
    });
  });

  r.get('/:name', requireAdmin, (req: Request, res: Response) => {
    const name = path.basename(req.params.name);
    if (!name.endsWith('.json')) {
      res.status(400).json({ error: 'invalid name' });
      return;
    }
    const full = path.join(crashesDir, name);
    try {
      const dump = readDiagnosticDump(full);
      res.json(dump);
    } catch {
      res.status(404).json({ error: 'not found' });
    }
  });

  return r;
}

/**
 * Inline admin gate — matches the pattern used in admin-health.ts.
 * authMiddleware at the /api level populates req.user; here we just check role.
 */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = (req as { user?: { role?: string } }).user?.role;
  if (role !== 'admin') {
    res.status(403).json({ error: 'admin required' });
    return;
  }
  next();
}
