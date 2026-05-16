# SP6 Write Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Wire widget-bound write-intent UI: viewer click on bound widget → `WriteIntentDialog` → POST to existing `/api/v1/scada/write-intents` → AI-suggestion / BroundUI confirm pipeline. Editor sidebar configures the binding.

**Architecture:** Add `writeIntent` field to `SvgWidgetItem`. Viewer-mode click on bound widget fires `onWriteIntent` callback up to `ScadaCanvas`, which owns dialog state. Dialog POSTs via `usePostWriteIntent`. Editor adds `WidgetWriteIntentPanel` parallel to `WidgetLinkPanel` from SP5.

**Tech Stack:** React 18 + TypeScript + zustand 4 + vitest + jsdom + @testing-library/react. No new server code (endpoint exists from SP1).

**Spec:** `docs/superpowers/specs/2026-05-16-fuxa-replacement-write-intent-design.md`

**Branch:** `feat/scada-data-model` (continue; T8 pushes + FF-merges to main)

---

## File Structure

**Create:**
- `packages/web-ui/src/hooks/usePostWriteIntent.ts`
- `packages/web-ui/src/hooks/__tests__/usePostWriteIntent.test.ts`
- `packages/web-ui/src/components/scada/runtime/WriteIntentDialog.tsx`
- `packages/web-ui/src/components/scada/runtime/__tests__/WriteIntentDialog.test.tsx`
- `packages/web-ui/src/components/scada/pages/WidgetWriteIntentPanel.tsx`
- `packages/web-ui/src/components/scada/pages/__tests__/WidgetWriteIntentPanel.test.tsx`
- `packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.writeIntent.test.tsx`
- `packages/web-ui/src/components/scada/__tests__/ScadaCanvas.writeIntent.test.tsx`

**Modify:**
- `packages/web-ui/src/widgets/svg/types.ts` — add `writeIntent` to `SvgWidgetItem` + Zod
- `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx` — `onWriteIntent` prop + click wrapper
- `packages/web-ui/src/components/scada/ScadaCanvas.tsx` — dialog state + integration
- `packages/web-ui/src/app/scada2/[viewId]/page.tsx` — pass `viewId` prop to ScadaCanvas
- `packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx` — add `WidgetWriteIntentPanel` to sidebar

---

## Conventions

- Run tests: `cd /Volumes/SSD/BIOCORE/packages/web-ui && export PATH="/Users/mac/.hermes/node/bin:$PATH" && pnpm exec vitest run <path>`
- TDD strict: write failing test → verify RED → implement → verify GREEN → commit
- Branch: `feat/scada-data-model`

---

## Task 1: `SvgWidgetItem.writeIntent` field + Zod

**Files:**
- Modify: `packages/web-ui/src/widgets/svg/types.ts`

- [ ] **Step 1: Add `writeIntent` to interface**

In `packages/web-ui/src/widgets/svg/types.ts`, modify the `SvgWidgetItem` interface. Find the existing `link?: { viewId: string };` line (added in SP5 T4) and add `writeIntent` right after:

```typescript
export interface SvgWidgetItem {
  // existing fields including link?: { viewId: string };
  link?: { viewId: string };
  writeIntent?: {
    tag: string;
    value?: number | string | boolean;
  };
}
```

In the Zod schema literal `SvgViewJsonSchema`, find the `link: z.object(...)` line and add `writeIntent` after it:

```typescript
    link: z.object({ viewId: z.string().min(1) }).optional(),
    writeIntent: z.object({
      tag: z.string().min(1),
      value: z.union([z.number(), z.string(), z.boolean()]).optional(),
    }).optional(),
```

- [ ] **Step 2: TSC clean**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no new errors mentioning `widgets/svg/types.ts`.

- [ ] **Step 3: Run existing svg widget tests to confirm no regression**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/ 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/svg/types.ts
git commit -m "feat(scada): SvgWidgetItem.writeIntent field + Zod"
```

---

## Task 2: `usePostWriteIntent` hook

**Files:**
- Create: `packages/web-ui/src/hooks/usePostWriteIntent.ts`
- Create: `packages/web-ui/src/hooks/__tests__/usePostWriteIntent.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/hooks/__tests__/usePostWriteIntent.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePostWriteIntent } from '../usePostWriteIntent';

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); (globalThis as any).fetch = fetchMock; });
afterEach(() => { vi.restoreAllMocks(); });

describe('usePostWriteIntent', () => {
  it('POSTs to /api/v1/scada/write-intents with correct body shape', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, suggestion_id: 42 }) });
    const { result } = renderHook(() => usePostWriteIntent());
    await act(async () => {
      await result.current.post({ tag: 't1', value: 1, reason: 'Refill', view_id: 'v1', widget_id: 'w1' });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/scada/write-intents',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as any).body);
    expect(body).toEqual({ tag: 't1', value: 1, reason: 'Refill', view_id: 'v1', widget_id: 'w1' });
  });

  it('returns suggestion_id on success', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, suggestion_id: 7 }) });
    const { result } = renderHook(() => usePostWriteIntent());
    let r: any;
    await act(async () => {
      r = await result.current.post({ tag: 't1', value: 1, reason: 'ok', view_id: 'v1', widget_id: 'w1' });
    });
    expect(r.suggestion_id).toBe(7);
  });

  it('throws on non-OK with server error code', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'no_active_batch' }) });
    const { result } = renderHook(() => usePostWriteIntent());
    await expect(async () => {
      await act(async () => {
        await result.current.post({ tag: 't1', value: 1, reason: 'ok', view_id: 'v1', widget_id: 'w1' });
      });
    }).rejects.toThrow(/no_active_batch/);
  });
});
```

- [ ] **Step 2: RED**

```bash
pnpm exec vitest run src/hooks/__tests__/usePostWriteIntent.test.ts 2>&1 | tail -15
```

Expected: `Cannot find module '../usePostWriteIntent'`.

- [ ] **Step 3: Create the hook**

Create `packages/web-ui/src/hooks/usePostWriteIntent.ts`:

```typescript
'use client';
import { useCallback } from 'react';

export interface WriteIntentInput {
  tag: string;
  value?: number | string | boolean | null;
  reason: string;
  view_id: string;
  widget_id: string;
}

export interface WriteIntentResult {
  success: true;
  suggestion_id: number;
}

export interface UsePostWriteIntentResult {
  post: (input: WriteIntentInput) => Promise<WriteIntentResult>;
}

export function usePostWriteIntent(): UsePostWriteIntentResult {
  const post = useCallback(async (input: WriteIntentInput): Promise<WriteIntentResult> => {
    const r = await fetch('/api/v1/scada/write-intents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) {
      let detail = '';
      try { const j = await r.json(); detail = j.error ?? ''; } catch { /* ignore */ }
      throw new Error(`HTTP ${r.status}${detail ? ` (${detail})` : ''}`);
    }
    return (await r.json()) as WriteIntentResult;
  }, []);
  return { post };
}
```

- [ ] **Step 4: GREEN**

```bash
pnpm exec vitest run src/hooks/__tests__/usePostWriteIntent.test.ts 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/hooks/usePostWriteIntent.ts \
        packages/web-ui/src/hooks/__tests__/usePostWriteIntent.test.ts
git commit -m "feat(scada-write): usePostWriteIntent hook (+3 tests)"
```

---

## Task 3: `WriteIntentDialog` component

**Files:**
- Create: `packages/web-ui/src/components/scada/runtime/WriteIntentDialog.tsx`
- Create: `packages/web-ui/src/components/scada/runtime/__tests__/WriteIntentDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/components/scada/runtime/__tests__/WriteIntentDialog.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { WriteIntentDialog } from '../WriteIntentDialog';

const postMock = vi.fn();
vi.mock('@/hooks/usePostWriteIntent', () => ({
  usePostWriteIntent: () => ({ post: postMock }),
}));

beforeEach(() => { postMock.mockReset(); });

const widget = { id: 'w1', type: 'svg-button', x: 0, y: 0, w: 10, h: 10, writeIntent: { tag: 'tank.fill', value: true } } as any;

describe('WriteIntentDialog', () => {
  it('renders tag, value readonly and reason input', () => {
    render(<WriteIntentDialog viewId="v1" widget={widget} onClose={() => {}} />);
    expect(screen.getByTestId('write-intent-tag').textContent).toContain('tank.fill');
    expect(screen.getByTestId('write-intent-value').textContent).toContain('true');
    expect(screen.getByTestId('write-intent-reason')).toBeTruthy();
  });

  it('submit disabled until reason ≥ 3 chars', async () => {
    render(<WriteIntentDialog viewId="v1" widget={widget} onClose={() => {}} />);
    const submitBtn = screen.getByTestId('write-intent-submit') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    const input = screen.getByTestId('write-intent-reason') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'ab' } }); });
    expect(submitBtn.disabled).toBe(true);
    await act(async () => { fireEvent.change(input, { target: { value: 'abc' } }); });
    expect(submitBtn.disabled).toBe(false);
  });

  it('submit posts and calls onClose on success', async () => {
    postMock.mockResolvedValueOnce({ success: true, suggestion_id: 99 });
    const onClose = vi.fn();
    render(<WriteIntentDialog viewId="v1" widget={widget} onClose={onClose} />);
    const input = screen.getByTestId('write-intent-reason') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'reason ok' } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('write-intent-submit')); });
    await waitFor(() => expect(postMock).toHaveBeenCalledWith({
      tag: 'tank.fill', value: true, reason: 'reason ok', view_id: 'v1', widget_id: 'w1',
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('submit failure shows inline error and does NOT close', async () => {
    postMock.mockRejectedValueOnce(new Error('HTTP 409 (no_active_batch)'));
    const onClose = vi.fn();
    render(<WriteIntentDialog viewId="v1" widget={widget} onClose={onClose} />);
    const input = screen.getByTestId('write-intent-reason') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'reason ok' } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('write-intent-submit')); });
    await waitFor(() => expect(screen.getByTestId('write-intent-error').textContent).toMatch(/no_active_batch/));
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: RED**

```bash
pnpm exec vitest run src/components/scada/runtime/__tests__/WriteIntentDialog.test.tsx 2>&1 | tail -15
```

Expected: `Cannot find module '../WriteIntentDialog'`.

- [ ] **Step 3: Create the dialog**

Create `packages/web-ui/src/components/scada/runtime/WriteIntentDialog.tsx`:

```tsx
'use client';
import React, { useState } from 'react';
import { usePostWriteIntent } from '@/hooks/usePostWriteIntent';
import type { SvgWidgetItem } from '@/widgets/svg/types';

interface Props {
  viewId: string;
  widget: SvgWidgetItem;
  onClose: () => void;
}

export function WriteIntentDialog({ viewId, widget, onClose }: Props) {
  const { post } = usePostWriteIntent();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wi = widget.writeIntent;
  const canSubmit = !submitting && reason.trim().length >= 3 && !!wi;

  async function onSubmit() {
    if (!canSubmit || !wi) return;
    setSubmitting(true);
    setError(null);
    try {
      await post({
        tag: wi.tag,
        value: wi.value ?? null,
        reason: reason.trim(),
        view_id: viewId,
        widget_id: widget.id,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="write-intent-dialog" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }}>
      <div style={{ background: '#fff', padding: 16, minWidth: 360, borderRadius: 4 }}>
        <h3 style={{ margin: '0 0 8px 0' }}>写意图确认</h3>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Tag</div>
          <div data-testid="write-intent-tag" style={{ fontFamily: 'monospace' }}>{wi?.tag ?? '(未设置)'}</div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Value</div>
          <div data-testid="write-intent-value" style={{ fontFamily: 'monospace' }}>{String(wi?.value ?? '(空)')}</div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Reason (≥ 3 字符)</label>
          <input
            data-testid="write-intent-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ width: '100%' }}
            autoFocus
            disabled={submitting}
          />
        </div>
        {error && <div data-testid="write-intent-error" style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>错误: {error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={submitting}>取消</button>
          <button
            data-testid="write-intent-submit"
            onClick={onSubmit}
            disabled={!canSubmit}
          >{submitting ? '提交中…' : '提交'}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

```bash
pnpm exec vitest run src/components/scada/runtime/__tests__/WriteIntentDialog.test.tsx 2>&1 | tail -10
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/runtime/WriteIntentDialog.tsx \
        packages/web-ui/src/components/scada/runtime/__tests__/WriteIntentDialog.test.tsx
git commit -m "feat(scada-write): WriteIntentDialog modal (+4 tests)"
```

---

## Task 4: `SvgWidgetInstance.writeIntent` click handler

**Files:**
- Modify: `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx`
- Create: `packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.writeIntent.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.writeIntent.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import { SvgWidgetInstance } from '../SvgWidgetInstance';
import type { SvgWidgetItem } from '@/widgets/svg/types';

beforeAll(() => { ensureBuiltinSvgWidgetsRegistered(); });

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgWidgetInstance writeIntent', () => {
  it('viewer click fires onWriteIntent when writeIntent set', () => {
    const item: SvgWidgetItem = {
      id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10,
      writeIntent: { tag: 't1', value: 1 },
    };
    const onWriteIntent = vi.fn();
    const { container } = renderInSvg(
      <SvgWidgetInstance instance={item} reactorId="F01" onWriteIntent={onWriteIntent} />
    );
    const wrapper = container.querySelector('[data-write-intent="true"]') as SVGElement;
    expect(wrapper).not.toBeNull();
    act(() => { fireEvent.click(wrapper); });
    expect(onWriteIntent).toHaveBeenCalledWith(item);
  });

  it('no click wrapper when writeIntent absent', () => {
    const item: SvgWidgetItem = { id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10 };
    const onWriteIntent = vi.fn();
    const { container } = renderInSvg(
      <SvgWidgetInstance instance={item} reactorId="F01" onWriteIntent={onWriteIntent} />
    );
    expect(container.querySelector('[data-write-intent="true"]')).toBeNull();
  });

  it('editMode does not attach click', () => {
    const item: SvgWidgetItem = {
      id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10,
      writeIntent: { tag: 't1', value: 1 },
    };
    const onWriteIntent = vi.fn();
    const { container } = renderInSvg(
      <SvgWidgetInstance instance={item} reactorId="F01" editMode onWriteIntent={onWriteIntent} />
    );
    expect(container.querySelector('[data-write-intent="true"]')).toBeNull();
  });
});
```

- [ ] **Step 2: RED**

```bash
pnpm exec vitest run src/components/scada/__tests__/SvgWidgetInstance.writeIntent.test.tsx 2>&1 | tail -15
```

Expected: 3 fails (no data-write-intent attribute, no callback wiring).

- [ ] **Step 3: Modify `SvgWidgetInstance.tsx`**

Replace the file `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx` with:

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
  editMode?: boolean;
  onWriteIntent?: (widget: SvgWidgetItem) => void;
}

export function SvgWidgetInstance({ instance, reactorId: _reactorId, editMode = false, onWriteIntent }: Props) {
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

  const inner = (() => {
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
    const mergedConfig = { ...(instance.props ?? {}), ...animResult.configOverrides };
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
  })();

  // Priority: writeIntent > link. Both ignored in editMode.
  if (!editMode && instance.writeIntent?.tag && onWriteIntent) {
    return (
      <g
        data-write-intent="true"
        style={{ cursor: 'pointer' }}
        onClick={() => onWriteIntent(instance)}
      >
        {inner}
      </g>
    );
  }
  if (!editMode && instance.link?.viewId) {
    return <a href={`/scada2/${instance.link.viewId}`}>{inner}</a>;
  }
  return inner;
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

- [ ] **Step 4: GREEN**

```bash
pnpm exec vitest run src/components/scada/__tests__/SvgWidgetInstance.writeIntent.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Existing component tests still pass**

```bash
pnpm exec vitest run src/components/scada/__tests__/ 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/SvgWidgetInstance.tsx \
        packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.writeIntent.test.tsx
git commit -m "feat(scada-write): SvgWidgetInstance writeIntent click handler (+3 tests)"
```

---

## Task 5: `ScadaCanvas` dialog state integration

**Files:**
- Modify: `packages/web-ui/src/components/scada/ScadaCanvas.tsx`
- Modify: `packages/web-ui/src/app/scada2/[viewId]/page.tsx`
- Create: `packages/web-ui/src/components/scada/__tests__/ScadaCanvas.writeIntent.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/components/scada/__tests__/ScadaCanvas.writeIntent.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import { ScadaCanvas } from '../ScadaCanvas';
import type { SvgViewJson } from '@/widgets/svg/types';

const postMock = vi.fn();
vi.mock('@/hooks/usePostWriteIntent', () => ({
  usePostWriteIntent: () => ({ post: postMock }),
}));

beforeAll(() => { ensureBuiltinSvgWidgetsRegistered(); });
beforeEach(() => { postMock.mockReset(); });

function makeView(): SvgViewJson {
  return {
    width: 100, height: 100,
    items: [
      { id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 50, h: 50, writeIntent: { tag: 't1', value: 1 } } as any,
    ],
  };
}

describe('ScadaCanvas write intent integration', () => {
  it('click on widget with writeIntent opens WriteIntentDialog', async () => {
    render(<ScadaCanvas view={makeView()} reactorId="F01" viewId="v-demo" />);
    const target = document.querySelector('[data-write-intent="true"]')!;
    await act(async () => { fireEvent.click(target); });
    expect(screen.getByTestId('write-intent-dialog')).toBeTruthy();
    expect(screen.getByTestId('write-intent-tag').textContent).toContain('t1');
  });

  it('dialog onClose hides the dialog', async () => {
    render(<ScadaCanvas view={makeView()} reactorId="F01" viewId="v-demo" />);
    const target = document.querySelector('[data-write-intent="true"]')!;
    await act(async () => { fireEvent.click(target); });
    expect(screen.getByTestId('write-intent-dialog')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText('取消')); });
    expect(screen.queryByTestId('write-intent-dialog')).toBeNull();
  });
});
```

- [ ] **Step 2: RED**

```bash
pnpm exec vitest run src/components/scada/__tests__/ScadaCanvas.writeIntent.test.tsx 2>&1 | tail -15
```

Expected: 2 fails (no viewId prop yet; no dialog rendering).

- [ ] **Step 3: Modify `ScadaCanvas.tsx`**

Replace `packages/web-ui/src/components/scada/ScadaCanvas.tsx` with:

```tsx
'use client';
import React, { useState } from 'react';
import { SvgViewJsonSchema, type SvgViewJson, type SvgWidgetItem } from '@/widgets/svg/types';
import { SvgWidgetInstance } from './SvgWidgetInstance';
import { ViewErrorDisplay } from './ViewErrorDisplay';
import { WriteIntentDialog } from './runtime/WriteIntentDialog';

interface Props {
  view: SvgViewJson;
  reactorId: string;
  viewId?: string;
}

export function ScadaCanvas({ view, reactorId, viewId = '' }: Props) {
  const parsed = SvgViewJsonSchema.safeParse(view);
  if (!parsed.success) {
    return <ViewErrorDisplay issues={parsed.error.issues} />;
  }
  const v = parsed.data as SvgViewJson;

  const sorted = [...v.items].sort(byZIndex);
  const [dialogWidget, setDialogWidget] = useState<SvgWidgetItem | null>(null);

  return (
    <>
      <svg
        viewBox={`0 0 ${v.width} ${v.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        {v.background ? <rect width={v.width} height={v.height} fill={v.background} /> : null}
        {sorted.map((item) => (
          <SvgWidgetInstance
            key={item.id}
            instance={item as SvgWidgetItem}
            reactorId={reactorId}
            onWriteIntent={setDialogWidget}
          />
        ))}
      </svg>
      {dialogWidget && (
        <WriteIntentDialog
          viewId={viewId}
          widget={dialogWidget}
          onClose={() => setDialogWidget(null)}
        />
      )}
    </>
  );
}

function byZIndex(a: SvgWidgetItem, b: SvgWidgetItem): number {
  return (a.zIndex ?? 0) - (b.zIndex ?? 0);
}
```

- [ ] **Step 4: Update viewer page to pass `viewId`**

Edit `packages/web-ui/src/app/scada2/[viewId]/page.tsx`. Find the line `return <ScadaCanvas view={state.view} reactorId={reactorId} />;` and change to:

```tsx
  return <ScadaCanvas view={state.view} reactorId={reactorId} viewId={viewId} />;
```

- [ ] **Step 5: GREEN**

```bash
pnpm exec vitest run src/components/scada/__tests__/ScadaCanvas.writeIntent.test.tsx src/components/scada/__tests__/ScadaCanvas.test.tsx 2>&1 | tail -10
```

Expected: 2 new + existing ScadaCanvas tests all green.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/ScadaCanvas.tsx \
        packages/web-ui/src/components/scada/__tests__/ScadaCanvas.writeIntent.test.tsx \
        packages/web-ui/src/app/scada2/[viewId]/page.tsx
git commit -m "feat(scada-write): ScadaCanvas dialog state + onWriteIntent wiring (+2 tests)"
```

---

## Task 6: `WidgetWriteIntentPanel` editor sidebar

**Files:**
- Create: `packages/web-ui/src/components/scada/pages/WidgetWriteIntentPanel.tsx`
- Create: `packages/web-ui/src/components/scada/pages/__tests__/WidgetWriteIntentPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/components/scada/pages/__tests__/WidgetWriteIntentPanel.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useEditorStore } from '@/components/scada/svg-editor/useEditorStore';
import { WidgetWriteIntentPanel } from '../WidgetWriteIntentPanel';

beforeEach(() => {
  useEditorStore.getState().__resetForTests({
    width: 800, height: 600,
    items: [{ id: 'w1', type: 'svg-button', x: 0, y: 0, w: 50, h: 50 }],
  });
});

describe('WidgetWriteIntentPanel', () => {
  it('renders nothing when no widget selected', () => {
    const { container } = render(<WidgetWriteIntentPanel />);
    expect(container.querySelector('[data-testid="widget-write-intent-panel"]')).toBeNull();
  });

  it('typing tag writes writeIntent.tag to widget', async () => {
    useEditorStore.getState().select(['w1'], 'replace');
    render(<WidgetWriteIntentPanel />);
    const tagInput = screen.getByTestId('write-intent-tag-input') as HTMLInputElement;
    await act(async () => { fireEvent.change(tagInput, { target: { value: 'tank.fill' } }); });
    const widget = useEditorStore.getState().view.items.find(it => it.id === 'w1')!;
    expect((widget as any).writeIntent).toEqual({ tag: 'tank.fill' });
  });

  it('typing value with number type writes numeric value', async () => {
    useEditorStore.getState().__resetForTests({
      width: 800, height: 600,
      items: [{ id: 'w1', type: 'svg-button', x: 0, y: 0, w: 50, h: 50, writeIntent: { tag: 'tank.fill' } } as any],
    });
    useEditorStore.getState().select(['w1'], 'replace');
    render(<WidgetWriteIntentPanel />);
    const valInput = screen.getByTestId('write-intent-value-input') as HTMLInputElement;
    const typeSel = screen.getByTestId('write-intent-value-type') as HTMLSelectElement;
    await act(async () => { fireEvent.change(typeSel, { target: { value: 'number' } }); });
    await act(async () => { fireEvent.change(valInput, { target: { value: '42' } }); });
    const widget = useEditorStore.getState().view.items.find(it => it.id === 'w1')!;
    expect((widget as any).writeIntent).toEqual({ tag: 'tank.fill', value: 42 });
  });

  it('boolean type stores boolean', async () => {
    useEditorStore.getState().__resetForTests({
      width: 800, height: 600,
      items: [{ id: 'w1', type: 'svg-button', x: 0, y: 0, w: 50, h: 50, writeIntent: { tag: 'tank.fill' } } as any],
    });
    useEditorStore.getState().select(['w1'], 'replace');
    render(<WidgetWriteIntentPanel />);
    const typeSel = screen.getByTestId('write-intent-value-type') as HTMLSelectElement;
    await act(async () => { fireEvent.change(typeSel, { target: { value: 'boolean' } }); });
    const valSel = screen.getByTestId('write-intent-value-bool') as HTMLSelectElement;
    await act(async () => { fireEvent.change(valSel, { target: { value: 'true' } }); });
    const widget = useEditorStore.getState().view.items.find(it => it.id === 'w1')!;
    expect((widget as any).writeIntent).toEqual({ tag: 'tank.fill', value: true });
  });

  it('clear button removes writeIntent', async () => {
    useEditorStore.getState().__resetForTests({
      width: 800, height: 600,
      items: [{ id: 'w1', type: 'svg-button', x: 0, y: 0, w: 50, h: 50, writeIntent: { tag: 'tank.fill', value: 1 } } as any],
    });
    useEditorStore.getState().select(['w1'], 'replace');
    render(<WidgetWriteIntentPanel />);
    await act(async () => { fireEvent.click(screen.getByTestId('write-intent-clear')); });
    const widget = useEditorStore.getState().view.items.find(it => it.id === 'w1')!;
    expect((widget as any).writeIntent).toBeUndefined();
  });
});
```

- [ ] **Step 2: RED**

```bash
pnpm exec vitest run src/components/scada/pages/__tests__/WidgetWriteIntentPanel.test.tsx 2>&1 | tail -15
```

Expected: `Cannot find module '../WidgetWriteIntentPanel'`.

- [ ] **Step 3: Create the panel**

Create `packages/web-ui/src/components/scada/pages/WidgetWriteIntentPanel.tsx`:

```tsx
'use client';
import React, { useMemo } from 'react';
import { useEditorStore } from '@/components/scada/svg-editor/useEditorStore';

type ValueType = 'string' | 'number' | 'boolean';

function inferType(v: unknown): ValueType {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
}

export function WidgetWriteIntentPanel() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const items = useEditorStore((s) => s.view.items);
  const setWidget = useEditorStore((s) => s.setWidget);

  if (selectedIds.size !== 1) return null;
  const [selectedId] = Array.from(selectedIds);
  const widget = items.find(it => it.id === selectedId);
  if (!widget) return null;

  const wi = (widget as any).writeIntent as { tag?: string; value?: number | string | boolean } | undefined;
  const currentType = useMemo<ValueType>(() => inferType(wi?.value), [wi?.value]);

  function setTag(tag: string) {
    if (!widget) return;
    setWidget(widget.id, { ...widget, writeIntent: { ...(wi ?? {}), tag } } as any);
  }
  function setValue(raw: string, type: ValueType) {
    if (!widget || !wi) return;
    let v: number | string | boolean | undefined;
    if (type === 'number') {
      const n = Number(raw);
      v = Number.isFinite(n) ? n : undefined;
    } else if (type === 'boolean') {
      v = raw === 'true';
    } else {
      v = raw;
    }
    setWidget(widget.id, { ...widget, writeIntent: { ...wi, value: v } } as any);
  }
  function setType(type: ValueType) {
    if (!widget || !wi) return;
    if (type === 'number') setValue('0', 'number');
    else if (type === 'boolean') setValue('false', 'boolean');
    else setValue('', 'string');
  }
  function clearAll() {
    if (!widget) return;
    const next = { ...widget } as any;
    delete next.writeIntent;
    setWidget(widget.id, next);
  }

  return (
    <div data-testid="widget-write-intent-panel" style={{ padding: 8, borderTop: '1px solid #eee' }}>
      <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>写意图 Tag</label>
      <input
        data-testid="write-intent-tag-input"
        value={wi?.tag ?? ''}
        onChange={(e) => setTag(e.target.value)}
        style={{ width: '100%', marginBottom: 6 }}
        placeholder="e.g. tank.fill"
      />
      {wi?.tag ? (
        <>
          <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>类型</label>
          <select
            data-testid="write-intent-value-type"
            value={currentType}
            onChange={(e) => setType(e.target.value as ValueType)}
            style={{ width: '100%', marginBottom: 6 }}
          >
            <option value="string">字符串</option>
            <option value="number">数字</option>
            <option value="boolean">布尔</option>
          </select>
          <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>值</label>
          {currentType === 'boolean' ? (
            <select
              data-testid="write-intent-value-bool"
              value={String(wi?.value ?? false)}
              onChange={(e) => setValue(e.target.value, 'boolean')}
              style={{ width: '100%' }}
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          ) : (
            <input
              data-testid="write-intent-value-input"
              value={String(wi?.value ?? '')}
              onChange={(e) => setValue(e.target.value, currentType)}
              style={{ width: '100%' }}
              type={currentType === 'number' ? 'number' : 'text'}
            />
          )}
          <button data-testid="write-intent-clear" onClick={clearAll} style={{ marginTop: 6 }}>清除</button>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

```bash
pnpm exec vitest run src/components/scada/pages/__tests__/WidgetWriteIntentPanel.test.tsx 2>&1 | tail -10
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/pages/WidgetWriteIntentPanel.tsx \
        packages/web-ui/src/components/scada/pages/__tests__/WidgetWriteIntentPanel.test.tsx
git commit -m "feat(scada-write): WidgetWriteIntentPanel editor sidebar (+5 tests)"
```

---

## Task 7: Editor page integration — add `WidgetWriteIntentPanel` to sidebar

**Files:**
- Modify: `packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx`

- [ ] **Step 1: Edit the editor page**

In `packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx`:

(a) Add import at top with the other component imports:

```tsx
import { WidgetWriteIntentPanel } from '@/components/scada/pages/WidgetWriteIntentPanel';
```

(b) In the sidebar `<aside>` JSX, add `<WidgetWriteIntentPanel />` immediately after `<WidgetLinkPanel ... />`:

```tsx
      <aside style={{ width: 260, borderLeft: '1px solid #eee', paddingLeft: 12 }}>
        <h4 style={{ margin: '0 0 8px 0' }}>选中的组件</h4>
        <WidgetLinkPanel projectId={state.projectId} currentViewId={viewId} />
        <WidgetWriteIntentPanel />
      </aside>
```

- [ ] **Step 2: Type-check**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no new errors mentioning `app/scada2/edit/[viewId]/page.tsx`.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx
git commit -m "feat(scada-write): editor sidebar includes WidgetWriteIntentPanel"
```

---

## Task 8: Full regression + smoke + push

**Files:** none modified.

- [ ] **Step 1: Web-ui suite**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm test 2>&1 | tail -20
```

Expected: all green. Was 325; adds ~17 → ~342.

- [ ] **Step 2: Server suite (sanity)**

```bash
cd /Volumes/SSD/BIOCORE/packages/server
pnpm test 2>&1 | tail -10
```

Expected: 100 passed (unchanged — no server code touched).

- [ ] **Step 3: TSC clean across web-ui**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no new errors in `runtime/`, `pages/WidgetWriteIntentPanel`, `hooks/usePostWriteIntent`, `app/scada2/`.

- [ ] **Step 4: Manual smoke (best-effort)**

```bash
lsof -i :3000 -sTCP:LISTEN -n -P 2>&1 | head -2
```

If listening:
```bash
curl -sI "http://localhost:3000/scada2/some-view-id?reactor=F01" 2>&1 | head -5
```

Otherwise report "servers not running, smoke skipped".

- [ ] **Step 5: Push + FF-merge**

```bash
cd /Volumes/SSD/BIOCORE
git push origin feat/scada-data-model 2>&1 | tail -5
git checkout main
git fetch origin main 2>&1 | tail -3
git merge --ff-only feat/scada-data-model 2>&1 | tail -3
git push origin main 2>&1 | tail -3
git checkout feat/scada-data-model
```

If FF fails (diverged), STOP and report — do NOT force-push.

---

## Done criteria

- ~17 new tests green; existing 494 still green → ~511 total
- TSC clean on all new files
- Viewer click on widget with `writeIntent` opens `WriteIntentDialog`
- Dialog reason validation enforced (≥ 3 chars)
- Submit POSTs to existing `/api/v1/scada/write-intents`
- Editor sidebar configures `writeIntent.tag` + `writeIntent.value` with type radio
- Clear button removes the binding
- All commits pushed to `feat/scada-data-model` and FF-merged to `main`
- Branch ready for SP7 (FUXA removal) or SP6.5 (write polish)
