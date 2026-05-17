// packages/web-ui/src/scada-engine/models/widget.ts
import { z } from 'zod';
import { FuxaPropertySchema } from './property';

export const FuxaWidgetSchema = z.object({
  id: z.string(),
  type: z.string(),                          // 'svg-ext-value' / 'svg-ext-html_button' / ...
  name: z.string().optional(),
  property: FuxaPropertySchema,
});
export type FuxaWidget = z.infer<typeof FuxaWidgetSchema>;
