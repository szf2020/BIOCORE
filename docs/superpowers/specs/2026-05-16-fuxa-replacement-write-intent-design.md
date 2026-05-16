# SP6 Write Intent / 写控件 — Design Spec

**Date:** 2026-05-16
**Sub-project:** 6/8 of FUXA replacement
**Branch:** `feat/scada-data-model`
**Prerequisites:** SP1-5 — all merged to main at `5ee0317`

---

## Goal

Add widget-bound **write intent** UI on top of SP1-5: bind a widget (Button/Switch/etc) to a tag + value; clicking in viewer opens `WriteIntentDialog`; operator enters reason; submission POSTs to existing `POST /scada/write-intents` endpoint which lands in the AI-suggestion / BroundUI confirm pipeline. **AI/HMI/外部 永不直写 PLC** — every write goes through engine confirmation.

**Out of scope (deferred):**
- Slider / Input live two-way binding (continuous write) → SP6.5
- Multi-action widgets (one click → multiple writes) → SP7
- Programmatic / scripted write triggers → SP8

---

## Architecture

```
packages/web-ui/src/widgets/svg/types.ts                                MODIFY
  +  writeIntent?: { tag: string; value?: number | string | boolean }

packages/web-ui/src/components/scada/SvgWidgetInstance.tsx              MODIFY
  +  onWriteIntent?: (widget) => void prop
  +  viewer mode: if writeIntent set, wrap inner <g> in onClick handler
  +  writeIntent + link mutually exclusive (writeIntent wins if both set)

packages/web-ui/src/hooks/usePostWriteIntent.ts                         NEW
  +  POST /api/v1/scada/write-intents with credentials

packages/web-ui/src/components/scada/runtime/WriteIntentDialog.tsx      NEW
  +  Modal: tag (readonly) + value (readonly) + reason input + submit
  +  reason validation: min 3 chars
  +  status: idle | submitting | success | error

packages/web-ui/src/components/scada/ScadaCanvas.tsx                    MODIFY
  +  dialog state: { open: boolean; widget?: SvgWidgetItem }
  +  onWriteIntent handler → open dialog with widget

packages/web-ui/src/components/scada/pages/WidgetWriteIntentPanel.tsx   NEW
  +  Editor sidebar: tag text input + value text input + clear button
  +  Mutually exclusive with WidgetLinkPanel — render conditionally

packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx                   MODIFY
  +  Sidebar adds WidgetWriteIntentPanel alongside WidgetLinkPanel
```

---

## Data Contract

### `SvgWidgetItem.writeIntent`

```ts
export interface SvgWidgetItem {
  // existing fields ...
  link?: { viewId: string };
  writeIntent?: {
    tag: string;
    value?: number | string | boolean;
  };
}
```

Zod schema:

```ts
writeIntent: z.object({
  tag: z.string().min(1),
  value: z.union([z.number(), z.string(), z.boolean()]).optional(),
}).optional(),
```

### `POST /api/v1/scada/write-intents` (existing — no server change)

```
body: {
  tag: string;
  value?: number | string | boolean | null;
  reason: string;          // min 3 chars after trim
  view_id: string;
  widget_id: string;
  batch_id?: string;       // omitted; server derives from active batch
}
→ 200 { success: true, suggestion_id }
→ 400 missing_required_fields | reason_too_short | invalid_value_type
→ 404 view_not_found
→ 409 no_active_batch
```

---

## Key flows

### Flow A — operator clicks widget in viewer

1. `ScadaCanvas` renders `SvgWidgetInstance` with `onWriteIntent` callback
2. Widget has `writeIntent: { tag: 'tank.fill', value: true }` → `SvgWidgetInstance` wraps inner `<g>` with `onClick` firing `onWriteIntent(widget)`
3. `ScadaCanvas` opens `WriteIntentDialog`
4. Dialog shows: Tag (readonly), Value (readonly), Reason input
5. Operator types reason ≥3 chars, clicks 提交
6. `usePostWriteIntent.post({ tag, value, reason, view_id, widget_id })`
7. On success → close + brief inline confirmation
8. On failure → inline error banner with retry

### Flow B — engineer configures widget in editor

1. Select widget → sidebar shows `WidgetLinkPanel` + `WidgetWriteIntentPanel`
2. If `link` set → `WidgetWriteIntentPanel` shows "已设置链接,先清除链接再设置写意图"
3. Otherwise: tag input + value input + clear button
4. On change: `setWidget(id, { ...widget, writeIntent: { tag, value } })`
5. Clear button removes `writeIntent` from widget

### Flow C — mutual exclusion

`link` and `writeIntent` exclusive in UI; if both set (legacy), `SvgWidgetInstance` prefers `writeIntent`.

---

## Edge cases

- **Missing tag**: write click is no-op if `writeIntent.tag` blank. Editor panel disables save if tag empty.
- **No active batch**: server returns 409. Dialog shows "当前无活动批次,无法提交写意图".
- **Permissions**: 401/403 → redirect `/login`.
- **Dialog close while submitting**: disable close button when status === 'submitting'.
- **Reason < 3 chars**: client-side validation; server validates again.
- **Value type**: editor panel offers radio: number / string / boolean.
- **Stale dialog**: if widget removed mid-dialog, submission still sends; server validates view exists.

---

## Performance

- Single POST per click. No N+1.
- Dialog unmounted when closed.
- No polling — existing WebSocket already plumbs `ai_suggestion` broadcast.

---

## Testing — ~17 new tests, TDD RED-first

| Layer | File | # |
|---|---|---|
| Hook | `usePostWriteIntent.test.ts` | 3 |
| Dialog | `WriteIntentDialog.test.tsx` | 4 |
| Widget click handler | `SvgWidgetInstance.writeIntent.test.tsx` | 3 |
| Canvas integration | `ScadaCanvas.writeIntent.test.tsx` | 2 |
| Editor sidebar | `WidgetWriteIntentPanel.test.tsx` | 5 |
| **Total** | | **~17** |

---

## File structure summary

**New (3 source + tests):**
- `packages/web-ui/src/hooks/usePostWriteIntent.ts`
- `packages/web-ui/src/components/scada/runtime/WriteIntentDialog.tsx`
- `packages/web-ui/src/components/scada/pages/WidgetWriteIntentPanel.tsx`

**Modify (4):**
- `packages/web-ui/src/widgets/svg/types.ts`
- `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx`
- `packages/web-ui/src/components/scada/ScadaCanvas.tsx`
- `packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx`

---

## Done criteria

- ~17 new tests green; existing 494 still green → ~511 total
- `pnpm exec tsc --noEmit` clean for new files
- Viewer click on widget with `writeIntent` opens dialog; submit posts to existing endpoint
- Editor sidebar exposes write-intent config UI
- link + writeIntent mutually exclusive in UI
- Audit log + WebSocket broadcast covered server-side (SP1)
- All commits on `feat/scada-data-model`; FF-merged to `main`

---

## Deferred to SP6.5+

- Slider / Input continuous write
- Multi-action widgets
- Scripted write triggers
- Write confirmation UI polish (BroundUI integration)
