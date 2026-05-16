// packages/web-ui/src/widgets/svg/types.ts
import { z } from 'zod';
import type { FC } from 'react';

export interface SvgViewJson {
  width: number;
  height: number;
  background?: string;
  items: SvgWidgetItem[];
}

export interface SvgWidgetItem {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  zIndex?: number;
  visible?: boolean;
  bindings?: { tag?: string };
  props?: Record<string, unknown>;
}

export interface SvgWidgetProps {
  width: number;
  height: number;
  tagValue?: unknown;
  tagStale?: boolean;
  config?: Record<string, unknown>;
}

export type SvgWidgetComponent = FC<SvgWidgetProps>;

export const SvgViewJsonSchema = z.object({
  width: z.number().positive().int(),
  height: z.number().positive().int(),
  background: z.string().optional(),
  items: z.array(z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
    rotation: z.number().optional(),
    zIndex: z.number().int().optional(),
    visible: z.boolean().optional(),
    bindings: z.object({ tag: z.string().optional() }).optional(),
    props: z.record(z.unknown()).optional(),
  })),
});
