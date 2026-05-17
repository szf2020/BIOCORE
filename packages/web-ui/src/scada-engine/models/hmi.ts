// packages/web-ui/src/scada-engine/models/hmi.ts
import { z } from 'zod';
import { FuxaWidgetSchema } from './widget';
import { FuxaVariableSchema } from './view';

/**
 * Current FuxaView schema version. BIOCore-internal — does not track FUXA upstream.
 * Bump + add an entry to models/upgrader.ts when the on-disk shape changes.
 */
export const FUXA_SCHEMA_VERSION = 1;

export const FuxaViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['svg', 'cards', 'svg-shapes']),
  svgcontent: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  background_color: z.string().optional(),
  profile: z.object({
    bkcolor: z.string().optional(),
    margin: z.number().optional(),
  }).optional(),
  items: z.record(FuxaWidgetSchema),
  variables: z.record(FuxaVariableSchema).optional(),
  parent_view_id: z.string().nullable().optional(),
  schemaVersion: z.literal(FUXA_SCHEMA_VERSION),
});
export type FuxaView = z.infer<typeof FuxaViewSchema>;

/**
 * Parse a JSON string from the server payload column into a FuxaView.
 * Throws ZodError on shape mismatch; callers decide whether to fall back
 * to a "broken view" placeholder.
 */
export function parseFuxaView(json: string): FuxaView {
  return FuxaViewSchema.parse(JSON.parse(json));
}
