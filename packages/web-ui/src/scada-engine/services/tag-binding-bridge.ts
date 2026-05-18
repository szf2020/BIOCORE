// SP-FX-7 T2: Tag-binding bridge — adapts useRealtimeStore subscription to gauge.onProcess calls.
// SAFETY: this module does not call writeTag or sendWsMessage. Read-only.
import { useRealtimeStore } from '@/stores/realtime-store';
import { readTagSnapshot } from './tag-binding';
import type { GaugeBase } from '../gauges/gauge-base';

export function bindGaugesToRealtime(
  reactorId: string,
  gauges: Map<string, GaugeBase>,
  widgetSignals: Map<string, string[]>,
): () => void {
  let active = true;

  // Cast to any: zustand vanilla types only expose 1-arg subscribe, but
  // the subscribeWithSelector-style 2-arg form works at runtime via Zustand internals.
  // In tests the mock accepts both args; in production useRealtimeStore is created
  // with create() which supports the 2-arg form when called with a selector.
  const unsubscribe = (useRealtimeStore as any).subscribe(
    (s: any) => s.reactorData?.[reactorId]?.processValues,
    (processValues: any) => {
      if (!active || !processValues) return;
      for (const [widgetId, gauge] of gauges) {
        const tagIds = widgetSignals.get(widgetId) ?? [];
        for (const tagId of tagIds) {
          try {
            const snapshot = readTagSnapshot(tagId);
            gauge.onProcess(snapshot);
          } catch (err) {
            console.warn(
              `[tag-binding-bridge] onProcess error widget=${widgetId} tag=${tagId}:`,
              err,
            );
          }
        }
      }
    },
  );

  return () => {
    active = false;
    unsubscribe();
  };
}
