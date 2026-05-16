// packages/web-ui/src/widgets/svg/animation/types.ts
import { z } from 'zod';

export interface ThresholdRange {
  min: number;
  max: number;
  value: unknown;
}

export type AnimationRule =
  | { kind: 'discreteMap'; map: Record<string, unknown>; default?: unknown }
  | { kind: 'thresholdRanges'; ranges: ThresholdRange[]; default?: unknown }
  | { kind: 'linearScale'; inMin: number; inMax: number; outMin: number; outMax: number; clamp?: boolean };

export type AnimationType =
  | 'color'
  | 'visibility'
  | 'rotate'
  | 'scale'
  | 'translate'
  | 'opacity'
  | 'blink'
  | 'text';

export interface SvgAnimation {
  type: AnimationType;
  tag: string;
  rule: AnimationRule;
  configKey?: string;
  axis?: 'x' | 'y';
}

export interface ApplyResult {
  visible: boolean;
  transform: string;
  opacity?: number;
  configOverrides: Record<string, unknown>;
}

export const AnimationRuleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('discreteMap'),
    map: z.record(z.unknown()),
    default: z.unknown().optional(),
  }),
  z.object({
    kind: z.literal('thresholdRanges'),
    ranges: z.array(z.object({ min: z.number(), max: z.number(), value: z.unknown() })),
    default: z.unknown().optional(),
  }),
  z.object({
    kind: z.literal('linearScale'),
    inMin: z.number(),
    inMax: z.number(),
    outMin: z.number(),
    outMax: z.number(),
    clamp: z.boolean().optional(),
  }),
]);

export const AnimationSchema = z.object({
  type: z.enum(['color', 'visibility', 'rotate', 'scale', 'translate', 'opacity', 'blink', 'text']),
  tag: z.string().min(1),
  rule: AnimationRuleSchema,
  configKey: z.string().optional(),
  axis: z.enum(['x', 'y']).optional(),
});
