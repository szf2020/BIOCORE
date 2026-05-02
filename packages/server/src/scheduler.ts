// ============================================================
// scheduler — boot-time background timer lifecycle
// ============================================================
// Extracted from index.ts (v1.9.0 P2 bucket 1).
//
// Today the only true boot-time recurring timer the server owns is the
// AI suggestion engine (started after server.listen, stopped during
// gracefulShutdown). Per-reactor collector ticks live with the reactor
// wiring (their lifecycle is tied to reactor add/remove, not server
// boot). The heartbeat timers live with PLC routes (their lifecycle
// is tied to per-connection start/stop calls).
//
// startSchedulers() captures the suggestion engine handle in module
// scope; stopSchedulers() lets gracefulShutdown finish quickly without
// touching the underlying engine implementation. Adding new boot-time
// timers should plug into this pair.
// ============================================================

import { startSuggestionEngine } from './ai-suggestion-engine';

export interface StartSchedulersOptions {
  sqlite: any;
  feedAdvisor: any;
  softSensorEngine: any;
  cusumDetectors: Map<string, Map<string, any>>;
  broadcast: (channel: string, payload: any, batchId?: string | null, reactorId?: string | null) => void;
  getRunningBatches: () => Array<{ batchId: string; reactorId: string; pv: Record<string, number> }>;
}

let suggestionEngineHandle: { stop: () => void } | null = null;

export function startSchedulers(opts: StartSchedulersOptions): void {
  // 启动 AI 建议生成后台引擎
  suggestionEngineHandle = startSuggestionEngine({
    sqlite: opts.sqlite,
    feedAdvisor: opts.feedAdvisor,
    softSensorEngine: opts.softSensorEngine,
    cusumDetectors: opts.cusumDetectors,
    broadcast: opts.broadcast,
    getRunningBatches: opts.getRunningBatches,
  });
}

export function stopSchedulers(): void {
  if (suggestionEngineHandle) {
    try { suggestionEngineHandle.stop(); } catch { /* ignore */ }
    suggestionEngineHandle = null;
  }
}
