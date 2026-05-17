// packages/web-ui/src/scada-engine/models/widget.ts
import { z } from 'zod';
import { FuxaPropertySchema } from './property';

export const FuxaWidgetSchema = z.object({
  id: z.string(),
  type: z.string(),                          // 'svg-ext-value' / 'svg-ext-html_button' / ...
  name: z.string().optional(),
  property: FuxaPropertySchema,
  // SP-FX-3a: editor geometry (optional for backward compat with v1 FUXA imports
  // that store coords in svgcontent). Editor patches these on drag/resize.
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().nonnegative().optional(),
  h: z.number().nonnegative().optional(),
});
export type FuxaWidget = z.infer<typeof FuxaWidgetSchema>;
