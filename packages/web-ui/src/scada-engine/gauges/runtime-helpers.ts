// SP-FX-48.12: shared runtime helpers for FUXA-style ranges[] + actions[].
// FUXA gauges encode value-driven styling via two arrays on widget.property:
//
//   ranges:  Array<{ min, max, color?, stroke?, text?, textColor? }>
//            Pick the first matching range for the current numeric value.
//
//   actions: Array<{ type: 'hide'|'show'|'blink', range: { min, max },
//                    options?: { period?: number } }>
//            Apply matching actions to a target SVGElement on each value tick.
//
// Widgets opt in by calling matchRange()/applyActions() from onProcess().
// Pure functions — caller owns DOM. Safe to import everywhere.

export interface Range {
  min: number;
  max: number;
  color?: string;
  stroke?: string;
  text?: string;
  textColor?: string;
}

export interface RangeAction {
  type: 'hide' | 'show' | 'blink';
  range?: { min: number; max: number };
  options?: { period?: number };
}

export function matchRange(value: unknown, ranges?: Range[] | null): Range | null {
  if (!Array.isArray(ranges) || ranges.length === 0) return null;
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  for (const r of ranges) {
    if (!Number.isFinite(r.min) || !Number.isFinite(r.max)) continue;
    if (num >= r.min && num <= r.max) return r;
  }
  return null;
}

export interface ActionRuntime {
  intervalIds: Map<SVGElement, ReturnType<typeof setInterval>>;
}

export function createActionRuntime(): ActionRuntime {
  return { intervalIds: new Map() };
}

/** Apply hide/show/blink actions whose ranges include `value`. Idempotent per tick. */
export function applyActions(
  value: unknown,
  actions: RangeAction[] | undefined,
  element: SVGElement | null,
  rt: ActionRuntime,
): void {
  if (!element) return;
  // Clear any prior blink first — re-evaluation each tick decides afresh
  const prev = rt.intervalIds.get(element);
  if (prev !== undefined) {
    clearInterval(prev);
    rt.intervalIds.delete(element);
    (element as unknown as HTMLElement).style.visibility = '';
  }
  if (!Array.isArray(actions) || actions.length === 0) return;
  const num = Number(value);
  for (const a of actions) {
    const inRange = a.range
      ? Number.isFinite(num) && num >= a.range.min && num <= a.range.max
      : false;
    if (!inRange) continue;
    if (a.type === 'hide') {
      (element as unknown as HTMLElement).style.display = 'none';
    } else if (a.type === 'show') {
      (element as unknown as HTMLElement).style.display = '';
    } else if (a.type === 'blink') {
      const period = Math.max(100, a.options?.period ?? 500);
      let on = true;
      const id = setInterval(() => {
        on = !on;
        (element as unknown as HTMLElement).style.visibility = on ? '' : 'hidden';
      }, period);
      rt.intervalIds.set(element, id);
    }
  }
}

/** Stop all blink timers tracked by this runtime; call from gauge.onUnmount. */
export function teardownActions(rt: ActionRuntime): void {
  for (const id of rt.intervalIds.values()) clearInterval(id);
  rt.intervalIds.clear();
}

// SP-FX-48.19: shared value formatter for FUXA-style widgets.
//
// Supported template forms (in `format` string):
//   '{value}'             → raw string of value
//   '{value} {unit}'      → value + space + unit
//   '%d'                  → integer floor
//   '%.Nf' / '%.Ne'       → fixed/exponential N decimals
//   '%s'                  → raw string
//   plain text            → passthrough (no substitution → returns input as-is)
//
// Append `unit` after substituted value when provided.
//
// `decimals` is a fallback applied to numeric values only when format does not
// already specify precision (no '%.Nf'). For non-numeric values, `decimals` is
// ignored and the raw string is used.
export function formatValue(
  value: unknown,
  format: string | undefined,
  options?: { decimals?: number; unit?: string },
): string {
  const fmt = format ?? '{value}';
  const unit = options?.unit ?? '';
  const decimals = options?.decimals;

  // printf-style tokens first (FUXA passes e.g. '%.2f', '$%.2f', '%d')
  const pctMatch = fmt.match(/%(?:\.(\d+))?([dfes])/);
  if (pctMatch) {
    const isNullish = value === null || value === undefined;
    const num = isNullish ? NaN : Number(value);
    let rendered: string;
    if (!Number.isFinite(num)) {
      // FUXA renders '--' for any non-numeric value in a numeric format slot
      // (including string values like 'abc').
      rendered = pctMatch[2] === 's' ? String(value ?? '--') : '--';
    } else if (pctMatch[2] === 'd') {
      rendered = String(Math.floor(num));
    } else if (pctMatch[2] === 'f') {
      const p = pctMatch[1] ? parseInt(pctMatch[1], 10) : (decimals ?? 0);
      rendered = num.toFixed(p);
    } else if (pctMatch[2] === 'e') {
      const p = pctMatch[1] ? parseInt(pctMatch[1], 10) : (decimals ?? 6);
      rendered = num.toExponential(p);
    } else {
      rendered = String(num);
    }
    return fmt.replace(pctMatch[0], rendered) + (unit ? ' ' + unit : '');
  }

  // Brace token substitution
  if (fmt.includes('{value}')) {
    let str: string;
    if (value === null || value === undefined) {
      str = '--';
    } else {
      const num = Number(value);
      if (Number.isFinite(num) && typeof decimals === 'number' && decimals >= 0) {
        str = num.toFixed(decimals);
      } else {
        str = String(value);
      }
    }
    let result = fmt.replace('{value}', str);
    if (unit && !result.includes('{unit}')) result += ' ' + unit;
    return result.replace('{unit}', unit);
  }

  // Plain text label, no substitution
  return fmt;
}
