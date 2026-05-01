import fs from 'node:fs';
import path from 'node:path';
import { inspectHandles } from './handles-inspector';

/**
 * On-disk JSON crash dumps for post-mortem analysis. Used by crash-handler
 * (uncaughtException / unhandledRejection) and memory-watchdog (oom_threshold).
 *
 * Dumps live in `<dir>/<ISO>-<pid>.json`. Auto-prune via `keepLast` keeps
 * disk usage bounded.
 */

export interface DumpOptions {
  dir?: string;
  keepLast?: number;
  extra?: Record<string, unknown>;
}

export interface Dump {
  ts: string;
  type: string;
  error: { message: string; stack?: string; code?: string };
  process: { pid: number; uptime: number; version: string };
  memory: { heapUsed: number; heapTotal: number; rss: number; external: number };
  handles: { active: number; byType: Record<string, number> };
  extra?: Record<string, unknown>;
}

export async function writeDiagnosticDump(
  err: unknown,
  type: string,
  opts: DumpOptions = {},
): Promise<string> {
  const dir = opts.dir ?? './crashes';
  fs.mkdirSync(dir, { recursive: true });

  const e = err instanceof Error ? err : new Error(String(err));
  const mem = process.memoryUsage();

  const dump: Dump = {
    ts: new Date().toISOString(),
    type,
    error: {
      message: e.message,
      stack: e.stack,
      code: (e as { code?: string }).code,
    },
    process: { pid: process.pid, uptime: process.uptime(), version: process.version },
    memory: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
    },
    handles: inspectHandles(),
    extra: opts.extra,
  };

  const filename = `${dump.ts.replace(/[:.]/g, '-')}-${process.pid}.json`;
  const file = path.join(dir, filename);
  fs.writeFileSync(file, JSON.stringify(dump, null, 2));

  if (opts.keepLast !== undefined && opts.keepLast >= 0) {
    pruneOldDumps(dir, opts.keepLast);
  }

  return file;
}

export function listDiagnosticDumps(dir: string): Array<{ path: string; ts: string }> {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const p = path.join(dir, f);
      return { path: p, ts: fs.statSync(p).mtime.toISOString() };
    })
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

export function readDiagnosticDump(p: string): Dump {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as Dump;
}

function pruneOldDumps(dir: string, keep: number): void {
  const list = listDiagnosticDumps(dir);
  for (const item of list.slice(0, Math.max(0, list.length - keep))) {
    fs.unlinkSync(item.path);
  }
}
