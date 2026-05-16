# FUXA Replacement — Sub-project 3/8: Animation Engine Design

**Date:** 2026-05-16
**Branch:** feat/scada-data-model
**Depends on:** Sub-projects 1 (SVG canvas runtime, HEAD 7347401) + 2 (Widget library v2, HEAD 9401d51)
**Successor:** Sub-project 4 (editor select/transform) consumes the animation schema

---

## Goal

Add per-widget visual-property bindings ("animations") so widget attributes (color, visibility, rotation, scale, translation, opacity, blink, text label) can be driven by live PLC tag values.

The widget components added in sub-project 2 stay untouched. Animations are injected at the `SvgWidgetInstance` layer — the same layer that already binds a single primary tag value.

## Scope

**In:**
- 8 animation types: `color`, `visibility`, `rotate`, `scale`, `translate`, `opacity`, `blink`, `text`
- 3 rule kinds: `discreteMap`, `thresholdRanges`, `linearScale`
- Multiple animations per widget; multiple tags per widget (one tag per animation)
- Zod schema for animation validation in view JSON
- Pure-function evaluator + integration in `SvgWidgetInstance`
- Blink: 1 Hz toggle via React hook + setInterval

**Out (deferred):**
- Expression engine (`tag1 + tag2 * 2`) — not needed for SCADA use cases; could be added later as a new rule kind without breaking the schema
- CSS keyframe animations / smooth transitions — animations are sample-immediate, no easing
- Editor UI to author animations — sub-project 4-5
- Write controls (sliders/switches that publish back) — sub-project 6

## Architecture

```
SvgWidgetItem.animations: SvgAnimation[]  (new field)
        ↓
SvgWidgetInstance:
  ├─ useAnimationTagStates(animations)   →  TagState[] (parallel to animations)
  ├─ useBlink(animations)                →  phase: boolean (only active if ≥1 blink animation)
  ├─ applyAnimations(animations, states, phase)  →  ApplyResult
  │    {
  │      visible: boolean,
  │      transform: string,             // 'translate(dx,dy) rotate(deg,cx,cy) scale(s)'
  │      opacity?: number,
  │      configOverrides: Record<string,unknown>
  │    }
  ├─ if (!result.visible) return null
  └─ render <g transform={base+result.transform} opacity={result.opacity}>
       <Component config={{...instance.props, ...result.configOverrides}} ... />
     </g>
```

**Key design properties:**
- Widgets remain pure (no change required to the 24 widget components from sub-project 2)
- All animation logic isolated to `widgets/svg/animation/` directory
- Pure evaluator (`evaluateAnimationRule`, `applyAnimations`) — independently testable
- React-bound parts (`useAnimationTagStates`, `useBlink`) are thin

## Type Contract

```typescript
// widgets/svg/animation/types.ts

export type AnimationRule =
  | { kind: 'discreteMap'; map: Record<string, unknown>; default?: unknown }
  | { kind: 'thresholdRanges'; ranges: ThresholdRange[]; default?: unknown }
  | { kind: 'linearScale'; inMin: number; inMax: number; outMin: number; outMax: number; clamp?: boolean };

export interface ThresholdRange {
  min: number;
  max: number;
  value: unknown;
}

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
  configKey?: string;          // only used by color/text: which config key to inject
  axis?: 'x' | 'y';            // only used by translate
}
```

**Zod schema** (added to `widgets/svg/types.ts` and to `SvgViewJsonSchema.items`):
```typescript
const AnimationRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('discreteMap'), map: z.record(z.unknown()), default: z.unknown().optional() }),
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

const AnimationSchema = z.object({
  type: z.enum(['color', 'visibility', 'rotate', 'scale', 'translate', 'opacity', 'blink', 'text']),
  tag: z.string().min(1),
  rule: AnimationRuleSchema,
  configKey: z.string().optional(),
  axis: z.enum(['x', 'y']).optional(),
});

// SvgWidgetItem extension:
animations: z.array(AnimationSchema).optional(),
```

## Rule Semantics

### `discreteMap`
Lookup by string-coerced tag value.
```typescript
evaluate({ kind:'discreteMap', map:{'0':'red','1':'green'}, default:'gray' }, 1) === 'green'
evaluate({ kind:'discreteMap', map:{'0':'red'}, default:'gray' }, 99) === 'gray'
```

### `thresholdRanges`
Linear scan; returns first matching range's `value`. Comparison is `min <= n < max` for all but the last (inclusive on both ends).
```typescript
evaluate({
  kind:'thresholdRanges',
  ranges:[
    { min:0, max:50, value:'#22c55e' },
    { min:50, max:80, value:'#facc15' },
    { min:80, max:100, value:'#dc2626' }
  ],
  default:'#000'
}, 75) === '#facc15'
```
Non-number / non-finite tag values fall through to `default`.

### `linearScale`
Linear interpolation between input range → output range.
```typescript
evaluate({ kind:'linearScale', inMin:0, inMax:100, outMin:0, outMax:360 }, 50) === 180
```
- If `clamp:true`, result is clamped to `[outMin, outMax]`.
- If `inMin === inMax`, returns `outMin` (avoid divide-by-zero).
- Non-number / non-finite tag values → returns `outMin`.

## Application Routing

`applyAnimations` is the orchestrator. For each animation, it evaluates the rule against the corresponding tag state and routes the result based on `type`:

| Type | Where applied | Required value type |
|---|---|---|
| `color` | `configOverrides[configKey ?? 'fillColor'] = result` | `string` |
| `visibility` | `visible &= !!result` (AND-combine) | `boolean` |
| `rotate` | `transform += ' rotate(deg, w/2, h/2)'` | `number` (degrees) |
| `scale` | `transform += ' scale(result)'` | `number` |
| `translate` | `transform += ' translate(dx,0)'` or `'translate(0,dy)'` (per axis) | `number` |
| `opacity` | `opacity = result` (clamped 0..1, last-wins if multiple) | `number` |
| `blink` | `visible &= result ? blinkPhase : true` | `boolean` |
| `text` | `configOverrides[configKey ?? 'label'] = String(result)` | any (coerced via String) |

**Order:** Animations are applied in array order. For mutually overriding properties (opacity, color/text into same configKey), later wins. For additive transforms (rotate/scale/translate), all are concatenated.

**Stale tags:** If `tagState.isStale === true`, the animation still applies (current value used). Stale-driven visual feedback comes from widgets' own `opacity-50` on `tagStale`, not from the animation layer.

## Blink Hook

```typescript
// widgets/svg/animation/useBlink.ts
export function useBlink(animations: SvgAnimation[] | undefined): boolean {
  const hasBlink = !!animations?.some(a => a.type === 'blink');
  const [phase, setPhase] = useState(true);
  useEffect(() => {
    if (!hasBlink) return;
    const id = setInterval(() => setPhase(p => !p), 500);  // 1 Hz toggle
    return () => clearInterval(id);
  }, [hasBlink]);
  return phase;
}
```

Only one interval per widget instance regardless of number of blink animations.

## Tag-State Hook

```typescript
// widgets/svg/animation/useAnimationTagStates.ts
export function useAnimationTagStates(animations: SvgAnimation[] | undefined): TagState[] {
  const list = animations ?? EMPTY;
  return list.map(a => useTag(a.tag));   // length stable per view JSON
}
const EMPTY: SvgAnimation[] = [];
```

Note on Rules of Hooks: `animations` array length is fixed by view JSON; React requires call count to be stable across renders. Editor remounts the component when animations are added/removed.

## File Structure

```
packages/web-ui/src/widgets/svg/animation/
  ├─ types.ts                              // types + AnimationSchema (zod)
  ├─ rules.ts                              // evaluateAnimationRule (pure)
  ├─ apply.ts                              // applyAnimations (pure)
  ├─ useBlink.ts                           // blink hook
  ├─ useAnimationTagStates.ts              // tag subscription wrapper
  └─ __tests__/
      ├─ rules.test.ts                     // 12 tests
      ├─ apply.test.ts                     // 10 tests
      └─ useBlink.test.ts                  // 3 tests
```

**Modified:**
- `packages/web-ui/src/widgets/svg/types.ts` — add `animations?: SvgAnimation[]` + schema merge
- `packages/web-ui/src/widgets/svg/index.ts` — re-export animation types + helpers
- `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx` — integrate
- `packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.animation.test.tsx` — new, ~6 tests

**Total new tests:** ~31

## Test Plan

### `rules.test.ts` (~12 tests)

```typescript
describe('evaluateAnimationRule', () => {
  describe('discreteMap', () => {
    it('returns mapped value on hit');
    it('returns default on miss');
    it('returns undefined when no default and miss');
    it('coerces tag value to string for lookup');
  });
  describe('thresholdRanges', () => {
    it('returns matching range value');
    it('returns default when out of range');
    it('uses first match when ranges overlap');
    it('treats inclusive [min, max] for last range');
    it('returns default for non-number tag value');
  });
  describe('linearScale', () => {
    it('interpolates correctly');
    it('returns outMin when inMin==inMax (no divide by zero)');
    it('clamps when clamp=true');
  });
});
```

### `apply.test.ts` (~10 tests)

```typescript
describe('applyAnimations', () => {
  it('returns identity for empty animations');
  it('visibility=false makes visible false');
  it('rotate animation adds rotate(deg, cx, cy) to transform');
  it('scale animation adds scale(s) to transform');
  it('translate animation with axis=x adds translate(dx,0)');
  it('translate animation with axis=y adds translate(0,dy)');
  it('opacity animation sets opacity (last-wins)');
  it('color animation injects into configOverrides.fillColor');
  it('color animation with configKey injects into that key');
  it('blink animation hides when phase=false');
});
```

### `useBlink.test.ts` (~3 tests)

```typescript
describe('useBlink', () => {
  it('returns true initially when no blink animation');
  it('toggles phase at 1 Hz when blink animation present');
  it('cleans up interval on unmount');
});
```

### `SvgWidgetInstance.animation.test.tsx` (~6 tests)

```typescript
describe('SvgWidgetInstance with animations', () => {
  it('applies rotate animation to outer g transform');
  it('applies color animation to widget fill via config override');
  it('hides widget when visibility animation evaluates false');
  it('combines rotate + color in same widget');
  it('falls through gracefully when tagState is stale');
  it('layers animation rotate on top of static rotation');
});
```

## Performance Budget

- 24 widgets × avg 2 animations × 5 Hz tag rate = 240 evals/s
- `evaluateAnimationRule`: ~0.5μs (lookup or arithmetic)
- `applyAnimations`: ~3μs per call (small object allocation)
- React commit: dominant cost (~50μs per widget update)
- Total animation overhead: ~1ms/s budget — well under React baseline

## Error Handling

**View-JSON validation (schema):**
- Animations with unknown `type` → Zod rejects, view rendered via existing `ViewErrorDisplay`
- Missing `tag` → Zod rejects
- Bad `rule.kind` → Zod rejects

**Runtime evaluation:**
- Tag value is `undefined` (not yet received) → `discreteMap` returns `default`; `thresholdRanges` returns `default`; `linearScale` returns `outMin`
- Tag value type mismatch (string when number expected) → fall through to default / outMin
- Rule produces wrong type for animation (e.g. `rotate` rule returns string) → silently ignored for that animation; widget renders without the animation

**Boundary:** existing `SvgErrorBoundary` already wraps each widget. If `applyAnimations` ever throws, the boundary catches it and renders a "broken widget" placeholder for that instance only.

## Backward Compatibility

`animations` is optional on `SvgWidgetItem`. Views authored before this sub-project (the smoke views from sub-projects 1+2) continue to render with no behavior change — `applyAnimations(undefined)` returns identity.

## Done Criteria

- 31 new tests, all green
- `pnpm --filter @biocore/web-ui test` passes (no regression from sub-projects 1+2)
- `pnpm exec tsc --noEmit` clean for new files
- A demo view (manual smoke) renders a tank with: green→red color animation, rotate-by-temperature animation, blink-on-fault animation — all driven by live tags via WS
- Branch `feat/scada-data-model` ready for sub-project 4 (editor select/transform on top of the animated runtime)
