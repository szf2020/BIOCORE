# SP-FX-6.2 Batch 2 — Controls Implementation Plan

**Date:** 2026-05-18
**Status:** Plan — ready for execution
**Spec:** `docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-6-2-batch2-controls-design.md`
**Baseline:** web-ui 856 vitest tests (HEAD f5810c0)

---

## Task List

### T1 — RED: Tests for gauge-semaphore

**Files created:**
- `packages/web-ui/src/scada-engine/gauges/__tests__/controls/batch2/gauge-semaphore.test.ts`

**Tests (5):**
1. `onMount` creates `<circle>` with `data-widget-id` in parentGroup
2. `onProcess({ value: 75, isStale: false })` sets fill to range color when 75 in [50,100]
3. `onProcess({ value: null, isStale: true })` sets fill to `#9ca3af`
4. `onPropertyChange` updates circle color with new ranges
5. `onUnmount` removes circle without throw (idempotent)

**Commit:** `test(scada): gauge-semaphore RED tests (SP-FX-6.2 T1)`
**Verify:** `npx vitest run ... gauge-semaphore` → 5 FAIL (RED)

---

### T2 — GREEN: Implement gauge-semaphore

**Files created:**
- `packages/web-ui/src/scada-engine/gauges/controls/batch2/gauge-semaphore.tsx`

**Impl:** `GaugeSemaphore` class implements all 5 `GaugeBase` hooks. Creates `<circle>` SVG element; `onProcess` finds matching range and sets fill. No onClick.

**Commit:** `feat(scada): GaugeSemaphore widget impl (SP-FX-6.2 T2)`
**Verify:** `npx vitest run ... gauge-semaphore` → 5 PASS

---

### T3 — RED: Tests for gauge-progress

**Files created:**
- `packages/web-ui/src/scada-engine/gauges/__tests__/controls/batch2/gauge-progress.test.ts`

**Tests (5):**
1. `onMount` creates background rect + bar rect in parentGroup with `data-widget-id`
2. `onProcess({ value: 50 })` sets bar height to ~50% of total height
3. `onProcess({ value: 0 })` sets bar height to 0
4. `onPropertyChange` updates bar fill color from new barColor property
5. `onUnmount` removes all elements without throw

**Commit:** `test(scada): gauge-progress RED tests (SP-FX-6.2 T3)`
**Verify:** 5 FAIL (RED)

---

### T4 — GREEN: Implement gauge-progress

**Files created:**
- `packages/web-ui/src/scada-engine/gauges/controls/batch2/gauge-progress.tsx`

**Impl:** `GaugeProgress` class — background rect full height, bar rect scaled by (value-min)/(max-min). Clamps to [min, max]. Optional label text element.

**Commit:** `feat(scada): GaugeProgress widget impl (SP-FX-6.2 T4)`
**Verify:** 5 PASS

---

### T5 — RED: Tests for html-switch

**Files created:**
- `packages/web-ui/src/scada-engine/gauges/__tests__/controls/batch2/html-switch.test.tsx`

**Tests (5):**
1. `onMount` creates foreignObject + input[type=checkbox] with `data-widget-id`
2. `onProcess({ value: '1' })` sets checkbox.checked = true when onValue='1'
3. `onProcess({ value: '0' })` sets checkbox.checked = false when offValue='0'
4. Simulating `change` event (checked=true) when mode='runtime' calls `ctx.onWriteIntent` with onValue
5. `onUnmount` removes foreignObject; does not throw on second call

**Commit:** `test(scada): html-switch RED tests (SP-FX-6.2 T5)`
**Verify:** 5 FAIL (RED)

---

### T6 — GREEN: Implement html-switch

**Files created:**
- `packages/web-ui/src/scada-engine/gauges/controls/batch2/html-switch.tsx`

**Impl:** `HtmlSwitchGauge` — foreignObject + checkbox. Change handler checks `mode==='runtime'` before calling `onWriteIntent`. `onProcess` updates checked state directly (no event fired).

**Commit:** `feat(scada): HtmlSwitchGauge widget impl (SP-FX-6.2 T6)`
**Verify:** 5 PASS

---

### T7 — RED: Tests for slider

**Files created:**
- `packages/web-ui/src/scada-engine/gauges/__tests__/controls/batch2/slider.test.tsx`

**Tests (5):**
1. `onMount` creates foreignObject + input[type=range] with min/max/step attrs and `data-widget-id`
2. `onProcess({ value: 42, isStale: false })` sets input.value = '42'
3. `onPropertyChange` updates min/max/step attributes on input element
4. Simulating `change` event when mode='runtime' calls `ctx.onWriteIntent` with numeric value 42
5. `onUnmount` removes foreignObject; does not throw on second call

**Commit:** `test(scada): slider RED tests (SP-FX-6.2 T7)`
**Verify:** 5 FAIL (RED)

---

### T8 — GREEN: Implement slider

**Files created:**
- `packages/web-ui/src/scada-engine/gauges/controls/batch2/slider.tsx`

**Impl:** `SliderGauge` — foreignObject + input[type=range]. Change handler fires `onWriteIntent` in runtime mode. `onProcess` updates value only when input !== activeElement.

**Commit:** `feat(scada): SliderGauge widget impl (SP-FX-6.2 T8)`
**Verify:** 5 PASS

---

### T9 — RED: Tests for pipe

**Files created:**
- `packages/web-ui/src/scada-engine/gauges/__tests__/controls/batch2/pipe.test.ts`

**Tests (5):**
1. `onMount` creates SVG elements with `data-widget-id`; applies options.pipe color as initial stroke
2. `onProcess({ value: 1 })` applies action.options.fillA when value is within action range
3. `onProcess({ value: 999 })` (out of all ranges) keeps default pipe color, no throw
4. `onPropertyChange` updates pipe color on property change
5. `onUnmount` removes SVG elements without throw

**Commit:** `test(scada): pipe RED tests (SP-FX-6.2 T9)`
**Verify:** 5 FAIL (RED)

---

### T10 — GREEN: Implement pipe

**Files created:**
- `packages/web-ui/src/scada-engine/gauges/controls/batch2/pipe.tsx`

**Impl:** `PipeGauge` — SVG `<rect>` background + `<line>` pipe indicator. `onProcess` iterates actions array; applies `fillA` of first matching range to line stroke. No animation logic.

**Commit:** `feat(scada): PipeGauge widget impl (SP-FX-6.2 T10)`
**Verify:** 5 PASS

---

### T11 — Barrel + schema additions + schema tests

**Files created:**
- `packages/web-ui/src/scada-engine/gauges/controls/batch2/index.ts`

**Files modified:**
- `packages/web-ui/src/scada-engine/editor/properties/widget-schemas.tsx` — add 5 schemas + exports
- `packages/web-ui/src/scada-engine/editor/properties/__tests__/widget-schemas.test.ts` — +10 tests

**Widget-schemas additions:**
- `gaugeSemaphoreSchema`, `gaugeProgressSchema`, `htmlSwitchSchema`, `sliderSchema`, `pipeSchema`
- All exported by name from `widget-schemas.tsx`

**Schema tests (+10, 2 per schema):**
1. Each schema has at least one entry with type `tag-ref` (variableId binding)
2. Each schema has `x`, `y`, `w`, `h` geometric entries

**Commit:** `feat(scada): batch2 barrel + 5 property schemas + 10 schema tests (SP-FX-6.2 T11)`
**Verify:** `npx vitest run ... widget-schemas` → previously passing + 10 new PASS

---

### T12 — Full regression + tsc

**Steps:**
1. `cd packages/web-ui && npx tsc --noEmit` → 0 errors
2. `npx vitest run` from packages/web-ui → ≥891 tests PASS (856 + 35)
3. `pnpm --filter @biocore/server test run` → 147
4. `pnpm --filter @biocore/data-service test run` → 84

**Commit:** only if minor fix required; else no commit

---

### T13 — Push

**Steps:**
1. `git log --oneline -12` — confirm all task commits T1-T11 present
2. `git push origin main`
3. If rejected (non-fast-forward): `git pull --rebase origin main && git push origin main`

---

## Summary

| Task | Type | Tests delta | Key files |
|------|------|-------------|-----------|
| T1 | RED test | +5 FAIL | gauge-semaphore.test.ts |
| T2 | GREEN impl | +5 PASS | gauge-semaphore.tsx |
| T3 | RED test | +5 FAIL | gauge-progress.test.ts |
| T4 | GREEN impl | +5 PASS | gauge-progress.tsx |
| T5 | RED test | +5 FAIL | html-switch.test.tsx |
| T6 | GREEN impl | +5 PASS | html-switch.tsx |
| T7 | RED test | +5 FAIL | slider.test.tsx |
| T8 | GREEN impl | +5 PASS | slider.tsx |
| T9 | RED test | +5 FAIL | pipe.test.ts |
| T10 | GREEN impl | +5 PASS | pipe.tsx |
| T11 | barrel+schemas | +10 PASS | batch2/index.ts, widget-schemas.tsx |
| T12 | regression | 0 | verify only |
| T13 | push | 0 | git push |

**Total new tests: +35 (856 → ≥891)**

---

End of plan.
