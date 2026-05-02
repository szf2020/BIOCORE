// ============================================================
// ai-wiring — AI/analytics singletons + per-batch CUSUM helpers
// ============================================================
// Extracted from index.ts (v1.9.0 P2 bucket 1).
//
// Holds the cross-request AI engine instances that the server wires
// into routes and the suggestion engine:
//   - softSensorEngine  (SoftSensorEngine, @biocore/soft-sensor)
//   - feedAdvisor       (FeedAdvisor,      @biocore/soft-sensor)
//   - rootCauseAnalyzer (RootCauseAnalyzer,@biocore/soft-sensor)
//
// Plus the per-batch CUSUM detector registry — the live anomaly
// detector map shared between the InfluxDB collector tick and the
// reactor event-bridge wiring:
//   - cusumDetectors                Map<batchId, Map<channel, CUSUMDetector>>
//   - getCusumKey(batchId)          lazily creates the per-channel detectors
//   - clearCusumDetectors(batchId)  cleanup on batch_completed/stopped (P1 leak fix)
//
// Behavior preserved: same module-load singleton construction as before
// (single shared instance per server process).
// ============================================================

import { SoftSensorEngine, FeedAdvisor, RootCauseAnalyzer } from '@biocore/soft-sensor';
// Re-export the SoftSensorEngine class so callers needing the static
// trainLinearModel() helper don't have to dual-import.
export { SoftSensorEngine };
// CUSUMDetector: ai-analytics barrel exposes the new module under alias CUSUMDetectorV2;
// the in-barrel CUSUMDetector class is the legacy in-file definition. We use the V2 alias here
// because the previous deep import was './cusum' (the new module).
import { CUSUMDetectorV2 as CUSUMDetector } from '@biocore/ai-analytics';

// ─── 软测量引擎 (全局单例) ─────────────────────────────────
export const softSensorEngine = new SoftSensorEngine();
export const feedAdvisor = new FeedAdvisor();
export const rootCauseAnalyzer = new RootCauseAnalyzer();

// ─── CUSUM 实时检测器 (per-batch per-channel) ──────────────
export const cusumDetectors = new Map<string, Map<string, CUSUMDetector>>();

export function getCusumKey(batchId: string): Map<string, CUSUMDetector> {
  if (!cusumDetectors.has(batchId)) {
    const channels = new Map<string, CUSUMDetector>();
    for (const ch of ['temperature', 'pH', 'DO', 'pressure', 'rpm']) {
      channels.set(ch, new CUSUMDetector());
    }
    cusumDetectors.set(batchId, channels);
  }
  return cusumDetectors.get(batchId)!;
}

// P1 修复: 批次完成/停止后清理 CUSUM 检测器, 避免内存泄漏
export function clearCusumDetectors(batchId: string): void {
  cusumDetectors.delete(batchId);
}

// Re-export the CUSUMDetector type so other files (cusum-routes consumers,
// etc.) can stay aligned with the alias chosen here.
export { CUSUMDetector };
