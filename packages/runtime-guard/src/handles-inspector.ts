/**
 * Snapshot of currently active Node.js handles, grouped by constructor name.
 * Used in /admin/health to spot handle leaks (sustained growth in TCP sockets,
 * Timeouts, FSReqCallback, etc).
 *
 * Note: process._getActiveHandles() is internal/undocumented but stable enough
 * for monitoring (used by clinic.js, why-is-node-running, etc). Falls back to
 * empty array if API removed in some future Node version.
 */
export interface HandlesReport {
  active: number;
  byType: Record<string, number>;
}

export function inspectHandles(): HandlesReport {
  const handles: unknown[] = (process as { _getActiveHandles?: () => unknown[] })
    ._getActiveHandles?.() ?? [];
  const byType: Record<string, number> = {};
  for (const h of handles) {
    const name = (h as { constructor?: { name?: string } })?.constructor?.name ?? 'Unknown';
    byType[name] = (byType[name] ?? 0) + 1;
  }
  return { active: handles.length, byType };
}
