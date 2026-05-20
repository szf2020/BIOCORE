// packages/web-ui/src/scada-engine/models/property.ts
import { z } from 'zod';

export const FuxaEventTypeSchema = z.enum([
  'click', 'dblclick', 'mousedown', 'mouseup', 'change',
]);
export type FuxaEventType = z.infer<typeof FuxaEventTypeSchema>;

export const FuxaEventActionSchema = z.enum([
  'open-view', 'close-view', 'set-value', 'navigate', 'run-script-skip',
]);
export type FuxaEventAction = z.infer<typeof FuxaEventActionSchema>;

export const FuxaEventSchema = z.object({
  type: FuxaEventTypeSchema,
  action: FuxaEventActionSchema,
  actparam: z.string(),
  actoptions: z.record(z.any()).optional(),
  // SP-FX-2: when true (default), set-value actions require ConfirmDialog
  // approval before writeTag fires. Designer can set false on view-property
  // dialog for high-frequency manual controls.
  requireConfirm: z.boolean().optional().default(true),
});
export type FuxaEvent = z.infer<typeof FuxaEventSchema>;

export const FuxaActionTypeSchema = z.enum([
  'visibility', 'opacity', 'rotate', 'scale', 'move', 'color', 'text',
]);
export type FuxaActionType = z.infer<typeof FuxaActionTypeSchema>;

export const FuxaActionSchema = z.object({
  type: FuxaActionTypeSchema,
  variableId: z.string(),
  range: z.object({ min: z.number(), max: z.number() }).optional(),
  output: z.object({ from: z.any(), to: z.any() }).optional(),
  conditionExpr: z.string().max(500).optional(),
  valueExpr: z.string().max(500).optional(),
});
export type FuxaAction = z.infer<typeof FuxaActionSchema>;

// SP-FX-FF.38: passthrough so widget-specific extension fields (shapeName,
// fill, stroke, ranges, color states, ...) survive parseFuxaView. Without
// this, Zod strips unknown keys → shape widgets re-rendered as red placeholder
// rects after view reload because shapeName is gone.
//
// actions is widened from FuxaActionSchema[] to record<any>[] because gauge
// widgets (motor/pipe/pump/shape) store RangeAction { type:'blink'|'hide'|
// 'show', range, options } here, not the FuxaAction shape consumed by
// evalAnimations. evalAnimations defensively type-checks; unknown types skip.
export const FuxaPropertySchema = z.object({
  variableId: z.string().optional(),
  variableSrc: z.enum(['device', 'system']).optional(),
  permission: z.number().int().optional(),
  events: z.array(FuxaEventSchema).optional(),
  actions: z.array(z.record(z.any())).optional(),
  options: z.record(z.any()).optional(),
}).passthrough();
export type FuxaProperty = z.infer<typeof FuxaPropertySchema>;
