# editor/

SCADA editor canvas. SP-FX-3 splits into:

- **SP-FX-3a (this commit set)** — Spike. svg.js + 8-handle scaffold + drag move + SE handle resize.
- **SP-FX-3b (next)** — snap-grid, true rotate, multi-select, full 8-handle resize, keyboard nudge, Esc cancel.

## Files

| File | Purpose |
|------|---------|
| `geometry.ts` | Pure functions: handle positions, hit test, drag delta |
| `canvas-svg.ts` | svg.js wrapper: root + widgetLayer + overlayLayer |
| `transform-handles.ts` | Selection overlay: 8 resize + 1 rotate handle + dashed rect |
| `pointer-tools.ts` | mousedown/move/up state machine |
| `EditorCanvas.tsx` | React shell, wires the above to editorStore |

## Test layers

- Pure (vitest) — `geometry.test.ts`
- jsdom (vitest) — `canvas-svg.test.ts`, `transform-handles.test.ts`, `EditorCanvas.test.tsx`
- State machine (vitest + mock canvas) — `pointer-tools.test.ts`
- E2E (Playwright) — `../../../../e2e/scada-editor-canvas.spec.ts`

## Constraints

- `'use client'` only (no SSR).
- Single mount per page — `editorStore` is a singleton.
- Widgets need `x/y/w/h` to render. Legacy FUXA imports without geometry skip with `console.warn` (SP-FX-3b will extend).
- Drag DOM updates run via `canvas.upsertWidget` (60fps); `editorStore.updateWidget` only fires on `mouseup` (single history entry per drag).

## Dev page

For Playwright fixture access: `app/dev/scada-editor-canvas/page.tsx`. Production-guarded. SP-FX-4 will wire the toolbar and delete this dev page.
