// packages/web-ui/src/scada-engine/models/view.ts
import { z } from 'zod';

export const FuxaVariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['tag', 'system', 'alias']),
  source: z.string(),                        // "<reactor_id>/<tag_path>", e.g. "Reactor-1/temperature"
});
export type FuxaVariable = z.infer<typeof FuxaVariableSchema>;

export function defaultEmptyView(id: string, name: string): {
  id: string; name: string; type: 'svg'; svgcontent: string;
  width: number; height: number; items: Record<string, never>;
  variables: Record<string, never>; schemaVersion: 1;
} {
  return {
    id,
    name,
    type: 'svg',
    svgcontent: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>',
    width: 800,
    height: 600,
    items: {},
    variables: {},
    schemaVersion: 1,
  };
}
