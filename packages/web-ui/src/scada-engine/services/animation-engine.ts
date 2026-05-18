// SP-FX-7: Animation engine — read-only, expression-driven SVG attribute patches.
// SAFETY INVARIANT: this module MUST NOT import writeTag, sendWsMessage, fetch, or XMLHttpRequest.
// Expressions run through expression-eval (sandboxed expr-eval parser; no eval()/new Function()).
import { evalExpression, parseTagsFromExpression } from './expression-eval';
import type { FuxaWidget, FuxaAction, FuxaActionType } from '../models';

export interface AnimationPatch {
  widgetId: string;
  target: FuxaActionType;
  value: string | number | boolean;
}

export interface ResolvedAnimation {
  widgetId: string;
  action: FuxaAction;
  tagIds: string[];
}

export function resolveAnimations(widgets: Record<string, FuxaWidget>): ResolvedAnimation[] {
  const result: ResolvedAnimation[] = [];
  for (const [widgetId, widget] of Object.entries(widgets)) {
    const actions = widget.property?.actions ?? [];
    for (const action of actions) {
      const exprTags = [
        ...parseTagsFromExpression(action.conditionExpr ?? ''),
        ...parseTagsFromExpression(action.valueExpr ?? ''),
      ];
      const legacyTags = action.variableId ? [action.variableId] : [];
      const tagIds = [...new Set([...exprTags, ...legacyTags])];
      result.push({ widgetId, action, tagIds });
    }
  }
  return result;
}

export function evalAnimations(
  resolved: ResolvedAnimation[],
  tagValues: Record<string, unknown>,
): AnimationPatch[] {
  const patches: AnimationPatch[] = [];
  for (const { widgetId, action } of resolved) {
    try {
      if (action.conditionExpr) {
        const condResult = evalExpression(
          action.conditionExpr,
          tagValues as Record<string, number | string | boolean>,
        );
        if (!condResult) continue;
        let value: string | number | boolean;
        if (action.valueExpr) {
          const evaled = evalExpression(
            action.valueExpr,
            tagValues as Record<string, number | string | boolean>,
          );
          value = (evaled as string | number | boolean) ?? true;
        } else {
          value = action.output?.to ?? true;
        }
        patches.push({ widgetId, target: action.type, value });
      } else if (action.range && action.output !== undefined) {
        const raw = tagValues[action.variableId];
        const tagNum = typeof raw === 'number' ? raw : Number(raw ?? 0);
        const { min, max } = action.range;
        if (tagNum < min || tagNum > max) continue;
        const pct = max === min ? 0 : (tagNum - min) / (max - min);
        const from = Number(action.output.from ?? 0);
        const to = Number(action.output.to ?? 0);
        patches.push({ widgetId, target: action.type, value: from + pct * (to - from) });
      }
    } catch (err) {
      console.warn(`[animation-engine] error widget=${widgetId} action=${action.type}:`, err);
    }
  }
  return patches;
}
