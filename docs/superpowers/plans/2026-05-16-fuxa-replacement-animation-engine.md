# FUXA Replacement — Sub-project 3/8: Animation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-widget visual-property bindings (color/visibility/rotate/scale/translate/opacity/blink/text) on top of the 24 widgets from sub-project 2, evaluated from live PLC tag values at the `SvgWidgetInstance` layer.

**Architecture:** Schema-driven rule evaluator (no JS eval). Three rule kinds (`discreteMap`, `thresholdRanges`, `linearScale`) feed eight animation types. Rules and their application are pure functions; React-bound parts are thin hooks. The 24 widget components from sub-project 2 are NOT modified — animations are routed via outer-`<g>` transforms/opacity or by merging into the widget's `config` prop.

**Tech Stack:** React 18 · TypeScript · zod 3.x · vitest 1.6 + @testing-library/react 14 + jsdom · existing `useTag` from `@/hooks/useTag`.

**Spec:** [/docs/superpowers/specs/2026-05-16-fuxa-replacement-animation-engine-design.md](../specs/2026-05-16-fuxa-replacement-animation-engine-design.md)

**Branch:** feat/scada-data-model

**Total tests:** ~36 (4 schema + 12 rules + 10 apply + 3 useBlink + 2 useAnimationTagStates + 6 integration)

**Test runner:** `pnpm` at `/Users/mac/.hermes/node/bin/pnpm`. Export `PATH="/Users/mac/.hermes/node/bin:$PATH"` if needed.

**Real hook signatures (verified):**
- `useTag(tagId: string)` returns `TagSnapshot { value: number | null; isStale: boolean; ageMs: number }`

---

## File Structure (locked)

**New files (all under `packages/web-ui/src/widgets/svg/animation/`):**
- `types.ts` — `SvgAnimation`, `AnimationRule`, `ThresholdRange`, `AnimationType`, `ApplyResult` types + zod `AnimationSchema`
- `rules.ts` — `evaluateAnimationRule(rule, value)` pure function
- `apply.ts` — `applyAnimations(animations, tagValues, blinkPhase, w, h)` pure function
- `useBlink.ts` — `useBlink(animations)` hook
- `useAnimationTagStates.ts` — `useAnimationTagStates(animations)` hook

**New test files (5 under `packages/web-ui/src/widgets/svg/animation/__tests__/`):**
- `rules.test.ts`
- `apply.test.ts`
- `useBlink.test.ts`
- `useAnimationTagStates.test.ts`
- `schema.test.ts`

**New test file (1 under `packages/web-ui/src/components/scada/__tests__/`):**
- `SvgWidgetInstance.animation.test.tsx`

**Modified files (3):**
- `packages/web-ui/src/widgets/svg/types.ts` — add `animations?: SvgAnimation[]` to `SvgWidgetItem`; merge `AnimationSchema` into `SvgViewJsonSchema.items`
- `packages/web-ui/src/widgets/svg/index.ts` — re-export animation types + helpers
- `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx` — wire animations

---

## Task 1: Extend `types.ts` with animation schema

**Files:**
- Modify: `packages/web-ui/src/widgets/svg/types.ts`
- Create: `packages/web-ui/src/widgets/svg/animation/types.ts`
- Create: `packages/web-ui/src/widgets/svg/animation/__tests__/schema.test.ts`

- [ ] **Step 1: Create `animation/types.ts`**

```typescript
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
```

- [ ] **Step 2: Write schema test**

Create `packages/web-ui/src/widgets/svg/animation/__tests__/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AnimationSchema } from '../types';

describe('AnimationSchema', () => {
  it('accepts a valid discreteMap color animation', () => {
    const result = AnimationSchema.safeParse({
      type: 'color',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '0': '#f00', '1': '#0f0' }, default: '#000' },
      configKey: 'fillColor',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid thresholdRanges visibility animation', () => {
    const result = AnimationSchema.safeParse({
      type: 'visibility',
      tag: 'F01.AI-1',
      rule: {
        kind: 'thresholdRanges',
        ranges: [{ min: 0, max: 50, value: true }, { min: 50, max: 100, value: false }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid linearScale rotate animation', () => {
    const result = AnimationSchema.safeParse({
      type: 'rotate',
      tag: 'F01.AI-2',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 360, clamp: true },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown animation type', () => {
    const result = AnimationSchema.safeParse({
      type: 'flash',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '0': 'a' } },
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run schema test, verify GREEN**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec vitest run src/widgets/svg/animation/__tests__/schema.test.ts 2>&1 | tail -10
```

Expected: `4 passed`.

- [ ] **Step 4: Wire `SvgAnimation` into `SvgWidgetItem` + view-JSON schema**

Edit `packages/web-ui/src/widgets/svg/types.ts`. At the top of the file, add an import:

```typescript
import { AnimationSchema, type SvgAnimation } from './animation/types';
```

In the `SvgWidgetItem` interface, add `animations` AFTER the `props` field:

```typescript
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
  animations?: SvgAnimation[];
}
```

In the `SvgViewJsonSchema` items object, add `animations` AFTER the `props` field:

```typescript
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
    animations: z.array(AnimationSchema).optional(),
  })),
});
```

- [ ] **Step 5: Type-check passes**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no NEW errors mentioning `widgets/svg/`.

- [ ] **Step 6: Run existing tests for regression**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/ src/components/scada/__tests__/ 2>&1 | tail -10
```

Expected: still all green (animation field is optional; existing views ignore it).

- [ ] **Step 7: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/svg/animation/types.ts \
        packages/web-ui/src/widgets/svg/animation/__tests__/schema.test.ts \
        packages/web-ui/src/widgets/svg/types.ts
git commit -m "feat(scada-svg): SvgAnimation types + zod schema; animations? on SvgWidgetItem"
```

---

## Task 2: `evaluateAnimationRule` — pure rule evaluator

**Files:**
- Create: `packages/web-ui/src/widgets/svg/animation/rules.ts`
- Create: `packages/web-ui/src/widgets/svg/animation/__tests__/rules.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web-ui/src/widgets/svg/animation/__tests__/rules.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateAnimationRule } from '../rules';

describe('evaluateAnimationRule', () => {
  describe('discreteMap', () => {
    it('returns mapped value on exact-string hit', () => {
      const r = { kind: 'discreteMap' as const, map: { '1': 'red', '2': 'green' }, default: 'gray' };
      expect(evaluateAnimationRule(r, 1)).toBe('red');
    });

    it('returns default on miss', () => {
      const r = { kind: 'discreteMap' as const, map: { '0': 'red' }, default: 'gray' };
      expect(evaluateAnimationRule(r, 99)).toBe('gray');
    });

    it('returns undefined when no default and miss', () => {
      const r = { kind: 'discreteMap' as const, map: { '0': 'red' } };
      expect(evaluateAnimationRule(r, 99)).toBeUndefined();
    });

    it('coerces null tag value to string "null" for lookup', () => {
      const r = { kind: 'discreteMap' as const, map: { 'null': 'gray', '1': 'green' }, default: 'fallback' };
      expect(evaluateAnimationRule(r, null)).toBe('gray');
    });
  });

  describe('thresholdRanges', () => {
    it('returns matching range value', () => {
      const r = {
        kind: 'thresholdRanges' as const,
        ranges: [
          { min: 0, max: 50, value: '#22c55e' },
          { min: 50, max: 80, value: '#facc15' },
          { min: 80, max: 100, value: '#dc2626' },
        ],
        default: '#000',
      };
      expect(evaluateAnimationRule(r, 75)).toBe('#facc15');
    });

    it('returns default when out of all ranges', () => {
      const r = {
        kind: 'thresholdRanges' as const,
        ranges: [{ min: 0, max: 50, value: 'in' }],
        default: 'out',
      };
      expect(evaluateAnimationRule(r, 100)).toBe('out');
    });

    it('uses first match when ranges overlap', () => {
      const r = {
        kind: 'thresholdRanges' as const,
        ranges: [
          { min: 0, max: 60, value: 'first' },
          { min: 50, max: 100, value: 'second' },
        ],
      };
      expect(evaluateAnimationRule(r, 55)).toBe('first');
    });

    it('includes upper bound of last range (inclusive max)', () => {
      const r = {
        kind: 'thresholdRanges' as const,
        ranges: [
          { min: 0, max: 50, value: 'a' },
          { min: 50, max: 100, value: 'b' },
        ],
      };
      expect(evaluateAnimationRule(r, 100)).toBe('b');
    });

    it('returns default for non-finite tag value', () => {
      const r = {
        kind: 'thresholdRanges' as const,
        ranges: [{ min: 0, max: 100, value: 'x' }],
        default: 'fallback',
      };
      expect(evaluateAnimationRule(r, null)).toBe('fallback');
      expect(evaluateAnimationRule(r, NaN)).toBe('fallback');
    });
  });

  describe('linearScale', () => {
    it('interpolates linearly at midpoint', () => {
      const r = { kind: 'linearScale' as const, inMin: 0, inMax: 100, outMin: 0, outMax: 360 };
      expect(evaluateAnimationRule(r, 50)).toBe(180);
    });

    it('returns outMin when inMin equals inMax (no divide by zero)', () => {
      const r = { kind: 'linearScale' as const, inMin: 50, inMax: 50, outMin: 10, outMax: 20 };
      expect(evaluateAnimationRule(r, 50)).toBe(10);
    });

    it('clamps result when clamp=true', () => {
      const r = { kind: 'linearScale' as const, inMin: 0, inMax: 100, outMin: 0, outMax: 360, clamp: true };
      expect(evaluateAnimationRule(r, 150)).toBe(360);
      expect(evaluateAnimationRule(r, -50)).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec vitest run src/widgets/svg/animation/__tests__/rules.test.ts 2>&1 | tail -10
```

Expected: FAIL with "Cannot find module '../rules'".

- [ ] **Step 3: Implement `evaluateAnimationRule`**

Create `packages/web-ui/src/widgets/svg/animation/rules.ts`:

```typescript
// packages/web-ui/src/widgets/svg/animation/rules.ts
import type { AnimationRule } from './types';

export function evaluateAnimationRule(rule: AnimationRule, tagValue: unknown): unknown {
  switch (rule.kind) {
    case 'discreteMap': {
      const key = String(tagValue);
      if (Object.prototype.hasOwnProperty.call(rule.map, key)) {
        return rule.map[key];
      }
      return rule.default;
    }
    case 'thresholdRanges': {
      const n = typeof tagValue === 'number' ? tagValue : Number(tagValue);
      if (!Number.isFinite(n)) return rule.default;
      const last = rule.ranges.length - 1;
      for (let i = 0; i < rule.ranges.length; i++) {
        const r = rule.ranges[i];
        const inRange = i === last ? n >= r.min && n <= r.max : n >= r.min && n < r.max;
        if (inRange) return r.value;
      }
      return rule.default;
    }
    case 'linearScale': {
      const n = typeof tagValue === 'number' ? tagValue : Number(tagValue);
      if (!Number.isFinite(n)) return rule.outMin;
      const span = rule.inMax - rule.inMin;
      if (span === 0) return rule.outMin;
      const ratio = (n - rule.inMin) / span;
      const out = rule.outMin + ratio * (rule.outMax - rule.outMin);
      if (rule.clamp) {
        const lo = Math.min(rule.outMin, rule.outMax);
        const hi = Math.max(rule.outMin, rule.outMax);
        return Math.max(lo, Math.min(hi, out));
      }
      return out;
    }
  }
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/animation/__tests__/rules.test.ts 2>&1 | tail -10
```

Expected: `12 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/svg/animation/rules.ts \
        packages/web-ui/src/widgets/svg/animation/__tests__/rules.test.ts
git commit -m "feat(scada-svg): evaluateAnimationRule + 12 tests (discreteMap/thresholdRanges/linearScale)"
```

---

## Task 3: `applyAnimations` — animation orchestrator

**Files:**
- Create: `packages/web-ui/src/widgets/svg/animation/apply.ts`
- Create: `packages/web-ui/src/widgets/svg/animation/__tests__/apply.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web-ui/src/widgets/svg/animation/__tests__/apply.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyAnimations } from '../apply';
import type { SvgAnimation } from '../types';

describe('applyAnimations', () => {
  it('returns identity for undefined animations', () => {
    const r = applyAnimations(undefined, [], true, 100, 100);
    expect(r.visible).toBe(true);
    expect(r.transform).toBe('');
    expect(r.opacity).toBeUndefined();
    expect(r.configOverrides).toEqual({});
  });

  it('visibility animation evaluating false hides widget', () => {
    const anim: SvgAnimation = {
      type: 'visibility',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '0': false, '1': true }, default: true },
    };
    const r = applyAnimations([anim], [0], true, 100, 100);
    expect(r.visible).toBe(false);
  });

  it('rotate animation appends rotate(deg, w/2, h/2) to transform', () => {
    const anim: SvgAnimation = {
      type: 'rotate',
      tag: 'F01.AI-0',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 360 },
    };
    const r = applyAnimations([anim], [50], true, 100, 80);
    expect(r.transform).toBe('rotate(180,50,40)');
  });

  it('scale animation appends scale(s)', () => {
    const anim: SvgAnimation = {
      type: 'scale',
      tag: 'F01.AI-0',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 1, outMax: 2 },
    };
    const r = applyAnimations([anim], [50], true, 100, 100);
    expect(r.transform).toBe('scale(1.5)');
  });

  it('translate animation with axis=x appends translate(dx,0)', () => {
    const anim: SvgAnimation = {
      type: 'translate',
      tag: 'F01.AI-0',
      axis: 'x',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 50 },
    };
    const r = applyAnimations([anim], [40], true, 100, 100);
    expect(r.transform).toBe('translate(20,0)');
  });

  it('translate animation with axis=y appends translate(0,dy)', () => {
    const anim: SvgAnimation = {
      type: 'translate',
      tag: 'F01.AI-0',
      axis: 'y',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 50 },
    };
    const r = applyAnimations([anim], [40], true, 100, 100);
    expect(r.transform).toBe('translate(0,20)');
  });

  it('opacity animation sets opacity (last-wins, clamped 0..1)', () => {
    const a1: SvgAnimation = {
      type: 'opacity',
      tag: 'F01.AI-0',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 1 },
    };
    const a2: SvgAnimation = {
      type: 'opacity',
      tag: 'F01.AI-1',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 2, clamp: true },
    };
    const r = applyAnimations([a1, a2], [50, 100], true, 100, 100);
    expect(r.opacity).toBe(1);
  });

  it('color animation injects into configOverrides.fillColor by default', () => {
    const anim: SvgAnimation = {
      type: 'color',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '1': '#0f0' }, default: '#000' },
    };
    const r = applyAnimations([anim], [1], true, 100, 100);
    expect(r.configOverrides).toEqual({ fillColor: '#0f0' });
  });

  it('color animation with configKey injects into that key', () => {
    const anim: SvgAnimation = {
      type: 'color',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '1': '#abc' }, default: '#000' },
      configKey: 'strokeColor',
    };
    const r = applyAnimations([anim], [1], true, 100, 100);
    expect(r.configOverrides).toEqual({ strokeColor: '#abc' });
  });

  it('blink animation hides widget when phase=false and rule yields true', () => {
    const anim: SvgAnimation = {
      type: 'blink',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '1': true }, default: false },
    };
    const visiblePhase = applyAnimations([anim], [1], true, 100, 100);
    expect(visiblePhase.visible).toBe(true);
    const hiddenPhase = applyAnimations([anim], [1], false, 100, 100);
    expect(hiddenPhase.visible).toBe(false);
    const notBlinking = applyAnimations([anim], [0], false, 100, 100);
    expect(notBlinking.visible).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/animation/__tests__/apply.test.ts 2>&1 | tail -10
```

Expected: FAIL "Cannot find module '../apply'".

- [ ] **Step 3: Implement `applyAnimations`**

Create `packages/web-ui/src/widgets/svg/animation/apply.ts`:

```typescript
// packages/web-ui/src/widgets/svg/animation/apply.ts
import type { ApplyResult, SvgAnimation } from './types';
import { evaluateAnimationRule } from './rules';

export function applyAnimations(
  animations: SvgAnimation[] | undefined,
  tagValues: unknown[],
  blinkPhase: boolean,
  w: number,
  h: number,
): ApplyResult {
  const result: ApplyResult = {
    visible: true,
    transform: '',
    configOverrides: {},
  };
  if (!animations || animations.length === 0) return result;

  const transformParts: string[] = [];

  for (let i = 0; i < animations.length; i++) {
    const anim = animations[i];
    const raw = evaluateAnimationRule(anim.rule, tagValues[i]);

    switch (anim.type) {
      case 'visibility': {
        if (raw === false) result.visible = false;
        break;
      }
      case 'blink': {
        if (raw === true && !blinkPhase) result.visible = false;
        break;
      }
      case 'rotate': {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          transformParts.push(`rotate(${raw},${w / 2},${h / 2})`);
        }
        break;
      }
      case 'scale': {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          transformParts.push(`scale(${raw})`);
        }
        break;
      }
      case 'translate': {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          if (anim.axis === 'y') transformParts.push(`translate(0,${raw})`);
          else transformParts.push(`translate(${raw},0)`);
        }
        break;
      }
      case 'opacity': {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          result.opacity = Math.max(0, Math.min(1, raw));
        }
        break;
      }
      case 'color': {
        if (typeof raw === 'string') {
          const key = anim.configKey ?? 'fillColor';
          result.configOverrides[key] = raw;
        }
        break;
      }
      case 'text': {
        if (raw !== undefined && raw !== null) {
          const key = anim.configKey ?? 'label';
          result.configOverrides[key] = String(raw);
        }
        break;
      }
    }
  }

  result.transform = transformParts.join(' ');
  return result;
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/animation/__tests__/apply.test.ts 2>&1 | tail -10
```

Expected: `10 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/svg/animation/apply.ts \
        packages/web-ui/src/widgets/svg/animation/__tests__/apply.test.ts
git commit -m "feat(scada-svg): applyAnimations orchestrator + 10 tests (visibility/transform/opacity/color/blink)"
```

---

## Task 4: `useBlink` hook

**Files:**
- Create: `packages/web-ui/src/widgets/svg/animation/useBlink.ts`
- Create: `packages/web-ui/src/widgets/svg/animation/__tests__/useBlink.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web-ui/src/widgets/svg/animation/__tests__/useBlink.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBlink } from '../useBlink';
import type { SvgAnimation } from '../types';

describe('useBlink', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true initially regardless of animations', () => {
    const { result } = renderHook(() => useBlink(undefined));
    expect(result.current).toBe(true);
  });

  it('toggles phase at 1 Hz when blink animation present', () => {
    const anims: SvgAnimation[] = [{
      type: 'blink',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '1': true }, default: false },
    }];
    const { result } = renderHook(() => useBlink(anims));
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(true);
  });

  it('does not start interval when no blink animation present', () => {
    const anims: SvgAnimation[] = [{
      type: 'color',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '1': '#0f0' }, default: '#000' },
    }];
    const { result } = renderHook(() => useBlink(anims));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/animation/__tests__/useBlink.test.ts 2>&1 | tail -10
```

Expected: FAIL "Cannot find module '../useBlink'".

- [ ] **Step 3: Implement `useBlink`**

Create `packages/web-ui/src/widgets/svg/animation/useBlink.ts`:

```typescript
// packages/web-ui/src/widgets/svg/animation/useBlink.ts
import { useEffect, useState } from 'react';
import type { SvgAnimation } from './types';

const BLINK_INTERVAL_MS = 500;

export function useBlink(animations: SvgAnimation[] | undefined): boolean {
  const hasBlink = !!animations?.some((a) => a.type === 'blink');
  const [phase, setPhase] = useState(true);
  useEffect(() => {
    if (!hasBlink) return;
    const id = setInterval(() => setPhase((p) => !p), BLINK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasBlink]);
  return phase;
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/animation/__tests__/useBlink.test.ts 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/svg/animation/useBlink.ts \
        packages/web-ui/src/widgets/svg/animation/__tests__/useBlink.test.ts
git commit -m "feat(scada-svg): useBlink hook + 3 tests (initial/toggle/no-blink)"
```

---

## Task 5: `useAnimationTagStates` hook

**Files:**
- Create: `packages/web-ui/src/widgets/svg/animation/useAnimationTagStates.ts`
- Create: `packages/web-ui/src/widgets/svg/animation/__tests__/useAnimationTagStates.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web-ui/src/widgets/svg/animation/__tests__/useAnimationTagStates.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAnimationTagStates } from '../useAnimationTagStates';
import type { SvgAnimation } from '../types';

vi.mock('@/hooks/useTag', () => ({
  useTag: vi.fn((tagId: string) => {
    if (tagId === 'F01.AI-0') return { value: 42, isStale: false, ageMs: 100 };
    if (tagId === 'F01.AI-1') return { value: 7, isStale: false, ageMs: 100 };
    return { value: null, isStale: true, ageMs: 9999 };
  }),
}));

describe('useAnimationTagStates', () => {
  it('returns empty array for undefined animations', () => {
    const { result } = renderHook(() => useAnimationTagStates(undefined));
    expect(result.current).toEqual([]);
  });

  it('returns one TagSnapshot per animation in order', () => {
    const anims: SvgAnimation[] = [
      { type: 'color', tag: 'F01.AI-0', rule: { kind: 'discreteMap', map: {} } },
      { type: 'rotate', tag: 'F01.AI-1', rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 360 } },
    ];
    const { result } = renderHook(() => useAnimationTagStates(anims));
    expect(result.current).toHaveLength(2);
    expect(result.current[0].value).toBe(42);
    expect(result.current[1].value).toBe(7);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/animation/__tests__/useAnimationTagStates.test.ts 2>&1 | tail -10
```

Expected: FAIL "Cannot find module '../useAnimationTagStates'".

- [ ] **Step 3: Implement `useAnimationTagStates`**

Create `packages/web-ui/src/widgets/svg/animation/useAnimationTagStates.ts`:

```typescript
// packages/web-ui/src/widgets/svg/animation/useAnimationTagStates.ts
import { useTag, type TagSnapshot } from '@/hooks/useTag';
import type { SvgAnimation } from './types';

const EMPTY: SvgAnimation[] = [];

export function useAnimationTagStates(animations: SvgAnimation[] | undefined): TagSnapshot[] {
  const list = animations ?? EMPTY;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return list.map((a) => useTag(a.tag));
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/animation/__tests__/useAnimationTagStates.test.ts 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/svg/animation/useAnimationTagStates.ts \
        packages/web-ui/src/widgets/svg/animation/__tests__/useAnimationTagStates.test.ts
git commit -m "feat(scada-svg): useAnimationTagStates hook + 2 tests (empty/per-animation)"
```

---

## Task 6: Integrate animations into `SvgWidgetInstance`

**Files:**
- Modify: `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx`
- Create: `packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.animation.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Create `packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.animation.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SvgWidgetInstance } from '../SvgWidgetInstance';
import type { SvgWidgetItem } from '@/widgets/svg/types';

vi.mock('@/hooks/useTag', () => ({
  useTag: vi.fn((tagId: string) => {
    if (tagId === 'F01.AI-0') return { value: 1, isStale: false, ageMs: 50 };
    if (tagId === 'F01.AI-1') return { value: 50, isStale: false, ageMs: 50 };
    if (tagId === 'F01.AI-2') return { value: 0, isStale: false, ageMs: 50 };
    return { value: null, isStale: true, ageMs: 9999 };
  }),
}));

import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

beforeEach(() => {
  ensureBuiltinSvgWidgetsRegistered();
});

describe('SvgWidgetInstance with animations', () => {
  it('applies rotate animation to outer g transform', () => {
    const item: SvgWidgetItem = {
      id: 'r1', type: 'svg-rect', x: 10, y: 20, w: 100, h: 80,
      animations: [{
        type: 'rotate',
        tag: 'F01.AI-1',
        rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 360 },
      }],
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    const g = container.querySelector('g');
    expect(g?.getAttribute('transform')).toContain('translate(10,20)');
    expect(g?.getAttribute('transform')).toContain('rotate(180,50,40)');
  });

  it('applies color animation by overriding widget config.fillColor', () => {
    const item: SvgWidgetItem = {
      id: 'l1', type: 'svg-lamp', x: 0, y: 0, w: 40, h: 40,
      bindings: { tag: 'F01.AI-0' },
      animations: [{
        type: 'color',
        tag: 'F01.AI-0',
        rule: { kind: 'discreteMap', map: { '1': '#abc' }, default: '#000' },
        configKey: 'onColor',
      }],
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#abc');
  });

  it('hides widget when visibility animation evaluates false', () => {
    const item: SvgWidgetItem = {
      id: 'r2', type: 'svg-rect', x: 0, y: 0, w: 50, h: 50,
      animations: [{
        type: 'visibility',
        tag: 'F01.AI-2',
        rule: { kind: 'discreteMap', map: { '0': false, '1': true }, default: true },
      }],
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    expect(container.querySelector('rect')).toBeNull();
  });

  it('combines rotate + color in the same widget', () => {
    const item: SvgWidgetItem = {
      id: 'l2', type: 'svg-lamp', x: 0, y: 0, w: 40, h: 40,
      bindings: { tag: 'F01.AI-0' },
      animations: [
        {
          type: 'rotate',
          tag: 'F01.AI-1',
          rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 90 },
        },
        {
          type: 'color',
          tag: 'F01.AI-0',
          rule: { kind: 'discreteMap', map: { '1': '#0f0' }, default: '#999' },
          configKey: 'onColor',
        },
      ],
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    const outer = container.querySelector('g');
    expect(outer?.getAttribute('transform')).toContain('rotate(45,20,20)');
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#0f0');
  });

  it('renders unchanged when animations field is absent', () => {
    const item: SvgWidgetItem = {
      id: 'l3', type: 'svg-lamp', x: 0, y: 0, w: 40, h: 40,
      bindings: { tag: 'F01.AI-0' },
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('layers animation rotate on top of static rotation', () => {
    const item: SvgWidgetItem = {
      id: 'r3', type: 'svg-rect', x: 5, y: 5, w: 60, h: 60, rotation: 30,
      animations: [{
        type: 'rotate',
        tag: 'F01.AI-1',
        rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 90 },
      }],
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    const tx = container.querySelector('g')?.getAttribute('transform') ?? '';
    expect(tx).toContain('translate(5,5)');
    expect(tx).toContain('rotate(30,30,30)');
    expect(tx).toContain('rotate(45,30,30)');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/components/scada/__tests__/SvgWidgetInstance.animation.test.tsx 2>&1 | tail -15
```

Expected: 6 failures — animations not yet wired.

- [ ] **Step 3: Modify `SvgWidgetInstance.tsx` to wire animations**

Replace the full file `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx` with:

```tsx
'use client';
import React from 'react';
import { useTag } from '@/hooks/useTag';
import { getSvgWidget } from '@/widgets/svg/registry';
import type { SvgWidgetItem } from '@/widgets/svg/types';
import { applyAnimations } from '@/widgets/svg/animation/apply';
import { useAnimationTagStates } from '@/widgets/svg/animation/useAnimationTagStates';
import { useBlink } from '@/widgets/svg/animation/useBlink';
import { SvgErrorBoundary } from './SvgErrorBoundary';

interface Props {
  instance: SvgWidgetItem;
  reactorId: string;
}

export function SvgWidgetInstance({ instance, reactorId: _reactorId }: Props) {
  const tagName = instance.bindings?.tag ?? '';
  const tagState = useTag(tagName);
  const hasBinding = !!instance.bindings?.tag;

  const animTagStates = useAnimationTagStates(instance.animations);
  const blinkPhase = useBlink(instance.animations);
  const animResult = applyAnimations(
    instance.animations,
    animTagStates.map((s) => s.value),
    blinkPhase,
    instance.w,
    instance.h,
  );

  if (instance.visible === false) return null;
  if (!animResult.visible) return null;

  const transform = buildTransform(instance, animResult.transform);
  const reg = getSvgWidget(instance.type);

  if (!reg) {
    console.warn(`Unknown SVG widget type: ${instance.type}`);
    return (
      <g transform={transform}>
        <rect width={instance.w} height={instance.h} fill="#fee" stroke="#c33" />
        <text x={4} y={14} fontSize={10} fill="#c33">?{instance.type}</text>
      </g>
    );
  }

  const Component = reg.component;
  const mergedConfig =
    Object.keys(animResult.configOverrides).length === 0
      ? instance.props
      : { ...(instance.props ?? {}), ...animResult.configOverrides };

  return (
    <g transform={transform} opacity={animResult.opacity}>
      <SvgErrorBoundary widgetId={instance.id} w={instance.w} h={instance.h}>
        <Component
          width={instance.w}
          height={instance.h}
          tagValue={hasBinding ? tagState.value : undefined}
          tagStale={hasBinding ? tagState.isStale : undefined}
          tagName={instance.bindings?.tag}
          config={mergedConfig}
        />
      </SvgErrorBoundary>
    </g>
  );
}

function buildTransform(instance: SvgWidgetItem, animationTransform: string): string {
  const parts: string[] = [`translate(${instance.x},${instance.y})`];
  if (instance.rotation != null && instance.rotation !== 0) {
    parts.push(`rotate(${instance.rotation},${instance.w / 2},${instance.h / 2})`);
  }
  if (animationTransform) {
    parts.push(animationTransform);
  }
  return parts.join(' ');
}
```

- [ ] **Step 4: Run integration tests, verify GREEN**

```bash
pnpm exec vitest run src/components/scada/__tests__/SvgWidgetInstance.animation.test.tsx 2>&1 | tail -15
```

Expected: `6 passed`.

- [ ] **Step 5: Run existing SvgWidgetInstance tests for regression**

```bash
pnpm exec vitest run src/components/scada/__tests__/SvgWidgetInstance.test.tsx 2>&1 | tail -10
```

Expected: all 8 existing tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/SvgWidgetInstance.tsx \
        packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.animation.test.tsx
git commit -m "feat(scada-svg): SvgWidgetInstance applies animations (transform/opacity/visibility/config) + 6 integration tests"
```

---

## Task 7: Re-export animation API from `index.ts`

**Files:**
- Modify: `packages/web-ui/src/widgets/svg/index.ts`

- [ ] **Step 1: Read current index.ts**

```bash
cat /Volumes/SSD/BIOCORE/packages/web-ui/src/widgets/svg/index.ts | tail -5
```

You should see the existing `export *` block ending with `export { SvgSensor } from './SvgSensor';`.

- [ ] **Step 2: Append animation re-exports**

Append AT THE END of `packages/web-ui/src/widgets/svg/index.ts`:

```typescript
export type {
  SvgAnimation,
  AnimationRule,
  AnimationType,
  ThresholdRange,
  ApplyResult,
} from './animation/types';
export { AnimationSchema, AnimationRuleSchema } from './animation/types';
export { evaluateAnimationRule } from './animation/rules';
export { applyAnimations } from './animation/apply';
export { useBlink } from './animation/useBlink';
export { useAnimationTagStates } from './animation/useAnimationTagStates';
```

- [ ] **Step 3: Type-check passes**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no NEW errors mentioning `widgets/svg/`.

- [ ] **Step 4: Run registry-builtins test (regression — count should still be 24)**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/registry-builtins.test.ts 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/svg/index.ts
git commit -m "feat(scada-svg): re-export animation types + helpers from widgets/svg/index"
```

---

## Task 8: Full regression check + manual smoke + push

**Files:** none modified.

- [ ] **Step 1: Run full web-ui test suite**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm test 2>&1 | tail -20
```

Expected: all green. Sub-project 3 adds ~36 new tests on top of sub-projects 1+2's ~204 = ~240 total.

If any test FAILS, STOP and report — do not proceed.

- [ ] **Step 2: Type-check passes**

```bash
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no NEW errors mentioning `widgets/svg/` or `components/scada/`.

- [ ] **Step 3: Manual smoke (best-effort, only if both dev servers running)**

```bash
lsof -i :3000 -sTCP:LISTEN -n -P 2>&1 | head -2
lsof -i :3001 -sTCP:LISTEN -n -P 2>&1 | head -2
```

If both running, inspect schema and adapt INSERT to actual columns:

```bash
sqlite3 /Volumes/SSD/BIOCORE/packages/server/data/biocore.db "PRAGMA table_info('scada_views');"
```

Sample animated view (adapt to actual schema!):

```json
{
  "width": 800,
  "height": 400,
  "background": "#f0f4f8",
  "items": [
    {
      "id": "lamp-blink",
      "type": "svg-lamp",
      "x": 40, "y": 40, "w": 40, "h": 40,
      "bindings": { "tag": "F01.AO-0_cv" },
      "animations": [
        { "type": "blink", "tag": "F01.AO-0_cv",
          "rule": { "kind": "discreteMap", "map": { "1": true }, "default": false } }
      ]
    },
    {
      "id": "tank-color",
      "type": "svg-tank",
      "x": 120, "y": 30, "w": 60, "h": 140,
      "bindings": { "tag": "F01.AI-0" },
      "animations": [
        { "type": "color", "tag": "F01.AI-0",
          "rule": { "kind": "thresholdRanges",
                    "ranges": [
                      {"min":0,"max":50,"value":"#22c55e"},
                      {"min":50,"max":80,"value":"#facc15"},
                      {"min":80,"max":100,"value":"#dc2626"}
                    ],
                    "default":"#3b82f6" },
          "configKey": "fillColor" }
      ]
    },
    {
      "id": "stirrer-rotate",
      "type": "svg-stirrer",
      "x": 220, "y": 60, "w": 80, "h": 80,
      "animations": [
        { "type": "rotate", "tag": "F01.rpm",
          "rule": { "kind": "linearScale", "inMin": 0, "inMax": 500,
                    "outMin": 0, "outMax": 360 } }
      ]
    }
  ]
}
```

Then verify API returns 200:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/scada/views/smoke-anim-1
```

If servers NOT running, SKIP and report.

- [ ] **Step 4: Cleanup smoke view (only if Step 3 ran)**

```bash
sqlite3 /Volumes/SSD/BIOCORE/packages/server/data/biocore.db "DELETE FROM scada_views WHERE id='smoke-anim-1';"
```

- [ ] **Step 5: Push branch + FF-merge to main**

```bash
cd /Volumes/SSD/BIOCORE
git push origin feat/scada-data-model 2>&1 | tail -5
git checkout main
git fetch origin main 2>&1 | tail -3
git merge --ff-only feat/scada-data-model 2>&1 | tail -3
git push origin main 2>&1 | tail -3
git checkout feat/scada-data-model
```

If FF fails (origin/main diverged), STOP and report — do not force-push.

---

## Done criteria

- ~36 new tests, all green (4 schema + 12 rules + 10 apply + 3 useBlink + 2 useAnimationTagStates + 6 integration; existing 204 from sub-projects 1+2 still green)
- `pnpm exec tsc --noEmit` clean for new files
- `SvgWidgetItem.animations` is optional — existing views unchanged
- `SvgWidgetInstance` integrates animations transparently — widget components from sub-project 2 untouched
- Manual smoke (best-effort) shows blink-on-output / color-by-threshold / rotate-by-rpm without console errors
- 8 commits pushed to `feat/scada-data-model` and FF-merged to `main`
- Branch ready for sub-project 4 (editor select/transform)
