import { z } from 'zod';

/**
 * 5 event types for BIOCore notifier (Sprint 4 Track A spec §6.3).
 * Each event has a strict zod schema; AlertRouter uses validatePayload()
 * to drop malformed events at the boundary.
 */
export const eventTypes = [
  'process_restart',
  'oom_threshold',
  'plc_disconnect_5min',
  'uncaught_exception',
  'heap_growth_anomaly',
] as const;

export type EventType = typeof eventTypes[number];

const payloadSchemas = {
  process_restart: z.object({
    reason: z.string(),
    pid: z.number().optional(),
    uptime_sec: z.number().optional(),
  }),
  oom_threshold: z.object({
    rss_mb: z.number(),
    threshold_mb: z.number(),
    samples: z.number(),
  }),
  plc_disconnect_5min: z.object({
    reactor_id: z.string(),
    duration_min: z.number(),
    last_seen: z.string(),
  }),
  uncaught_exception: z.object({
    message: z.string(),
    stack: z.string().optional(),
    code: z.string().optional(),
  }),
  heap_growth_anomaly: z.object({
    baseline_mb: z.number(),
    current_mb: z.number(),
    growth_pct: z.number(),
  }),
} satisfies Record<EventType, z.ZodTypeAny>;

export type EventPayload<T extends EventType> = z.infer<typeof payloadSchemas[T]>;

export function validatePayload<T extends EventType>(
  type: T,
  payload: unknown,
): { success: true; data: EventPayload<T> } | { success: false; error: string } {
  const schema = payloadSchemas[type];
  const r = schema.safeParse(payload);
  if (r.success) return { success: true, data: r.data as EventPayload<T> };
  return { success: false, error: r.error.message };
}
