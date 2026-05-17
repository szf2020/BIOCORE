# SP-FX-2 Services + Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the runtime spine for the FUXA SCADA editor + viewer: 4 services (`tag-binding`, `editor-store`, `expression-eval`, `selection`) + 4 dialogs (`Confirm`, `SectionMessage`, `ViewProperty`, `FileUpload`), and patch the `FuxaEventSchema` with a `requireConfirm` field needed for operator manual writes.

**Architecture:** All new code lives under `packages/web-ui/src/scada-engine/services/` and `.../dialogs/`. Services are framework-agnostic where possible: `expression-eval` and `selection` are pure modules; `tag-binding` wraps the existing `useTag` hook for React consumers and exposes an imperative `readTagSnapshot` for SVG-side callers; `editor-store` is a zustand store mirroring the SP-FX-1 `FuxaView` model. Dialogs use the existing project `Dialog` primitive at `@/components/ui/dialog.tsx` — no new UI dependency.

**Tech Stack:** Node 20+, TypeScript 5, Next.js 14 / React 18 (web-ui), zustand 4.4, immer 10 (new), expr-eval 2 (new), zod 3 (existing), vitest + jsdom + @testing-library/react (existing). pnpm workspace.

---

## File Structure (what this plan creates / modifies)

**Create (test helpers):**
- `packages/web-ui/src/test/wsMock.ts` — `mockWsConnection({onSend, queueAck})` helper
- `packages/web-ui/src/test/exprFixtures.ts` — 50+ valid + 20 invalid FUXA expression samples

**Create (services):**
- `packages/web-ui/src/scada-engine/services/tag-binding.ts` — useTag wrapper + readTagSnapshot + writeTag w/ ack timeout
- `packages/web-ui/src/scada-engine/services/__tests__/tag-binding.test.ts` — 10 unit tests
- `packages/web-ui/src/scada-engine/services/__tests__/tag-binding.integration.test.tsx` — 5 integration tests
- `packages/web-ui/src/scada-engine/services/editor-store.ts` — zustand store (view + dirty + undo + selection)
- `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts` — 18 tests
- `packages/web-ui/src/scada-engine/services/selection.ts` — boxIntersects + diffSelection
- `packages/web-ui/src/scada-engine/services/__tests__/selection.test.ts` — 8 tests
- `packages/web-ui/src/scada-engine/services/expression-eval.ts` — expr-eval wrap + parseTagsFromExpression
- `packages/web-ui/src/scada-engine/services/__tests__/expression-eval.test.ts` — 14 tests
- `packages/web-ui/src/scada-engine/services/__tests__/expression-eval.fuxa-fixtures.test.ts` — FUXA expression validation (R1 stop-condition gate)
- `packages/web-ui/src/scada-engine/services/index.ts` — barrel re-export

**Create (dialogs):**
- `packages/web-ui/src/scada-engine/dialogs/ConfirmDialog.tsx`
- `packages/web-ui/src/scada-engine/dialogs/__tests__/ConfirmDialog.test.tsx` — 5 tests
- `packages/web-ui/src/scada-engine/dialogs/SectionMessageDialog.tsx`
- `packages/web-ui/src/scada-engine/dialogs/__tests__/SectionMessageDialog.test.tsx` — 4 tests
- `packages/web-ui/src/scada-engine/dialogs/ViewPropertyDialog.tsx`
- `packages/web-ui/src/scada-engine/dialogs/__tests__/ViewPropertyDialog.test.tsx` — 6 tests
- `packages/web-ui/src/scada-engine/dialogs/FileUploadDialog.tsx`
- `packages/web-ui/src/scada-engine/dialogs/__tests__/FileUploadDialog.test.tsx` — 5 tests
- `packages/web-ui/src/scada-engine/dialogs/index.ts` — barrel re-export

**Modify:**
- `packages/web-ui/package.json` — add `expr-eval ^2.0.2` + `immer ^10.0.0`
- `packages/web-ui/src/stores/realtime-store.ts` — add `sendWsMessage(msg)` export
- `packages/web-ui/src/scada-engine/models/property.ts` — patch `FuxaEventSchema` add `requireConfirm?: boolean`
- `packages/web-ui/src/scada-engine/index.ts` — re-export `services/*` and `dialogs/*`

**Test count target:**
- web-ui 390 → **~467** (+77: tag-binding 15 + editor-store 18 + selection 8 + expression-eval 14 + fuxa-fixtures 2 + hmi schema 2 + sendWsMessage 3 + dialogs 20)

---

## Task 1: Install deps + test helpers (wsMock + exprFixtures)

**Files:**
- Modify: `packages/web-ui/package.json`
- Create: `packages/web-ui/src/test/wsMock.ts`
- Create: `packages/web-ui/src/test/exprFixtures.ts`

- [ ] **Step 1: Add new deps to package.json**

Edit `packages/web-ui/package.json`. Locate the `"dependencies"` block. Insert two new entries alphabetically among the existing dependencies:

```json
"expr-eval": "^2.0.2",
"immer": "^10.0.4",
```

Run install (resolves the lockfile too):

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm install
```

Expected: install completes; `node_modules/expr-eval/dist/index.js` and `node_modules/immer/dist/immer.js` exist after install.

- [ ] **Step 2: Create `wsMock.ts`**

Create `packages/web-ui/src/test/wsMock.ts`:

```ts
// Test helper: mock the realtime-store WS for tag-binding writeTag tests (SP-FX-2).
// Tests install this BEFORE the module under test runs so it captures the
// realtime-store.sendWsMessage pointer. Each writeTag() call resolves only
// after the test drains the queued ack via `flushAck()` or auto-acks via
// `autoAck()`.

import { vi } from 'vitest';

interface SentMessage {
  type: string;
  reqId?: string;
  [k: string]: unknown;
}

interface QueuedAck {
  reqId: string;
  ok: boolean;
  error?: string;
}

export interface MockWs {
  sent: SentMessage[];
  send: ReturnType<typeof vi.fn>;
  flushAck: (ack: QueuedAck) => void;
  autoAck: (ok?: boolean, error?: string) => void;
  ackQueue: QueuedAck[];
  registerAckHandler: (fn: (ack: QueuedAck) => void) => void;
  triggerSendFailure: (err: Error) => void;
}

export function makeMockWs(): MockWs {
  let ackHandler: ((ack: QueuedAck) => void) | null = null;
  let sendError: Error | null = null;
  const sent: SentMessage[] = [];
  const ackQueue: QueuedAck[] = [];

  const send = vi.fn((msg: SentMessage) => {
    if (sendError) throw sendError;
    sent.push(msg);
  });

  return {
    sent,
    send,
    ackQueue,
    flushAck: (ack) => {
      ackQueue.push(ack);
      if (ackHandler) ackHandler(ack);
    },
    autoAck: (ok = true, error) => {
      const last = sent[sent.length - 1];
      if (!last || !last.reqId) throw new Error('autoAck: no reqId on last sent message');
      const ack: QueuedAck = { reqId: last.reqId as string, ok };
      if (error) ack.error = error;
      ackQueue.push(ack);
      if (ackHandler) ackHandler(ack);
    },
    registerAckHandler: (fn) => { ackHandler = fn; },
    triggerSendFailure: (err) => { sendError = err; },
  };
}
```

- [ ] **Step 3: Create `exprFixtures.ts`**

Create `packages/web-ui/src/test/exprFixtures.ts`:

```ts
// 50+ valid + 20 invalid expression samples. Used by:
// - expression-eval.test.ts (unit tests choose specific cases)
// - expression-eval.fuxa-fixtures.test.ts (Task 8 batch validation, R1 gate)

export interface ExprFixture {
  expr: string;
  vars?: Record<string, number | string | boolean>;
  expected?: unknown;
  label?: string;
}

export const VALID_EXPRESSIONS: ExprFixture[] = [
  // Arithmetic
  { expr: '1 + 1', expected: 2 },
  { expr: '2 * 3 - 4', expected: 2 },
  { expr: '10 / 4', expected: 2.5 },
  { expr: '10 % 3', expected: 1 },
  { expr: '(1 + 2) * 3', expected: 9 },
  { expr: '2 ^ 10', expected: 1024 },
  // Tags
  { expr: 'temperature', vars: { temperature: 37 }, expected: 37 },
  { expr: 'temp + 10', vars: { temp: 25 }, expected: 35 },
  { expr: 'a + b', vars: { a: 1, b: 2 }, expected: 3 },
  { expr: 'tag1 + tag2 / 100', vars: { tag1: 50, tag2: 200 }, expected: 52 },
  { expr: '(temp - 32) * 5 / 9', vars: { temp: 100 }, expected: 37.77777777777778 },
  { expr: 'flow_rate * 60', vars: { flow_rate: 10 }, expected: 600 },
  // Comparison
  { expr: 'value > 50', vars: { value: 60 }, expected: true },
  { expr: 'value > 50', vars: { value: 40 }, expected: false },
  { expr: 'a >= b', vars: { a: 5, b: 5 }, expected: true },
  { expr: 'a < b', vars: { a: 3, b: 4 }, expected: true },
  { expr: 'a == b', vars: { a: 7, b: 7 }, expected: true },
  { expr: 'a != b', vars: { a: 7, b: 8 }, expected: true },
  // Logical
  { expr: 'a and b', vars: { a: true, b: true }, expected: true },
  { expr: 'a or b', vars: { a: false, b: true }, expected: true },
  { expr: 'not a', vars: { a: false }, expected: true },
  { expr: '(temp > 30) and (temp < 80)', vars: { temp: 50 }, expected: true },
  { expr: '(temp < 30) or (temp > 80)', vars: { temp: 90 }, expected: true },
  // Ternary / IF
  { expr: 'IF(temp < 80, 1, 0)', vars: { temp: 50 }, expected: 1 },
  { expr: 'IF(temp < 80, 1, 0)', vars: { temp: 90 }, expected: 0 },
  { expr: 'IF(level > 50, "high", "low")', vars: { level: 60 }, expected: 'high' },
  { expr: 'temp > 50 ? 1 : 0', vars: { temp: 60 }, expected: 1 },
  // Math functions
  { expr: 'MIN(a, b)', vars: { a: 5, b: 3 }, expected: 3 },
  { expr: 'MAX(a, b)', vars: { a: 5, b: 3 }, expected: 5 },
  { expr: 'ABS(x)', vars: { x: -7 }, expected: 7 },
  { expr: 'ROUND(3.7)', expected: 4 },
  { expr: 'ROUND(3.14159, 2)', expected: 3.14 },
  { expr: 'MIN(a, b, c)', vars: { a: 5, b: 3, c: 1 }, expected: 1 },
  // Compound
  { expr: 'IF(MIN(a, b) > 10, "ok", "low")', vars: { a: 12, b: 15 }, expected: 'ok' },
  { expr: 'ABS(t1 - t2)', vars: { t1: 50, t2: 35 }, expected: 15 },
  { expr: 'ROUND((a + b) / 2)', vars: { a: 5, b: 8 }, expected: 7 },
  { expr: '(a + b + c) / 3', vars: { a: 10, b: 20, c: 30 }, expected: 20 },
  { expr: 'rate * elapsed_min', vars: { rate: 2, elapsed_min: 45 }, expected: 90 },
  // Constants
  { expr: '3.14159', expected: 3.14159 },
  { expr: '0', expected: 0 },
  { expr: '-1', expected: -1 },
  // Booleans as expressions
  { expr: 'true', expected: true },
  { expr: 'false', expected: false },
  // String selection via IF
  { expr: 'IF(state == 1, "ON", "OFF")', vars: { state: 1 }, expected: 'ON' },
  { expr: 'IF(state == 1, "ON", "OFF")', vars: { state: 0 }, expected: 'OFF' },
  // Nested IF
  { expr: 'IF(t < 30, "cold", IF(t < 80, "warm", "hot"))', vars: { t: 50 }, expected: 'warm' },
  { expr: 'IF(t < 30, "cold", IF(t < 80, "warm", "hot"))', vars: { t: 90 }, expected: 'hot' },
  { expr: 'IF(t < 30, "cold", IF(t < 80, "warm", "hot"))', vars: { t: 20 }, expected: 'cold' },
  // Unary
  { expr: '-temp', vars: { temp: 25 }, expected: -25 },
  // Multiple operators
  { expr: 'a + b - c', vars: { a: 10, b: 5, c: 3 }, expected: 12 },
  { expr: 'a * b + c * d', vars: { a: 2, b: 3, c: 4, d: 5 }, expected: 26 },
  { expr: 'a / b * 100', vars: { a: 1, b: 4 }, expected: 25 },
  // Edge numerics
  { expr: '0 * x', vars: { x: 999 }, expected: 0 },
  { expr: '1', expected: 1 },
];

export const INVALID_EXPRESSIONS: ExprFixture[] = [
  { expr: '', label: 'empty' },
  { expr: '   ', label: 'whitespace only' },
  { expr: 'a +', label: 'trailing operator' },
  { expr: '+ a', label: 'leading operator' },
  { expr: '(a + b', label: 'unclosed paren' },
  { expr: 'a + b)', label: 'extra paren' },
  { expr: 'a..b', label: 'double dot' },
  { expr: 'a..b.c', label: 'invalid member' },
  { expr: 'obj.prop', label: 'member access (forbidden)', vars: { obj: { prop: 1 } as any } },
  { expr: 'console.log(1)', label: 'unsafe call' },
  { expr: 'eval("1")', label: 'eval call' },
  { expr: 'new Date()', label: 'constructor call' },
  { expr: '@invalid', label: 'illegal token' },
  { expr: 'a # b', label: 'illegal operator' },
  { expr: 'function(){return 1}', label: 'function definition' },
  { expr: 'a => b', label: 'arrow fn' },
  { expr: 'a; b', label: 'semicolon' },
  { expr: 'a, b', label: 'bare comma' },
  { expr: 'a +'.repeat(170), label: 'too long (>500 chars)' },
];
```

- [ ] **Step 4: Verify install + helpers compile**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | grep -E "wsMock|exprFixtures" | head -5
```

Expected: empty output (no errors in the two new files).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/package.json packages/web-ui/src/test/wsMock.ts packages/web-ui/src/test/exprFixtures.ts
git status --short
# If a lockfile changed (pnpm-lock.yaml at repo root or in package), add it too:
git add pnpm-lock.yaml 2>/dev/null || true
git commit -m "feat(web-ui): add expr-eval + immer deps + test helpers (SP-FX-2)

wsMock for tag-binding writeTag ack flow; exprFixtures with 50+ valid
+ 19 invalid expression samples for expression-eval coverage."
```

---

## Task 2: realtime-store sendWsMessage helper

**Files:**
- Modify: `packages/web-ui/src/stores/realtime-store.ts`
- Create: `packages/web-ui/src/stores/__tests__/realtime-store-send.test.ts`

**Why this task exists:** tag-binding's `writeTag` needs to send a WS message. The WS socket is currently a module-private `let ws: WebSocket | null` in `realtime-store.ts` with no exposed `send`. We add a tiny named export `sendWsMessage(msg)` that uses the same socket, keeping the singleton invariant intact.

- [ ] **Step 1: Write the failing test**

Create `packages/web-ui/src/stores/__tests__/realtime-store-send.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWsMessage, __testHooks } from '../realtime-store';

describe('sendWsMessage (SP-FX-2)', () => {
  beforeEach(() => { __testHooks.__resetWsForTests(); });

  it('throws when socket not connected', () => {
    expect(() => sendWsMessage({ type: 'set-value', tagId: 'F01.AI-0', value: 1 }))
      .toThrowError(/not connected/i);
  });

  it('sends JSON-stringified message via the bound socket', () => {
    const fakeWs = { send: vi.fn(), readyState: 1 /* OPEN */ } as unknown as WebSocket;
    __testHooks.__bindWsForTests(fakeWs);
    sendWsMessage({ type: 'set-value', tagId: 'F01.AI-0', value: 1 });
    expect(fakeWs.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fakeWs.send as any).mock.calls[0][0])).toEqual({
      type: 'set-value', tagId: 'F01.AI-0', value: 1,
    });
  });

  it('throws when socket readyState is not OPEN', () => {
    const fakeWs = { send: vi.fn(), readyState: 0 /* CONNECTING */ } as unknown as WebSocket;
    __testHooks.__bindWsForTests(fakeWs);
    expect(() => sendWsMessage({ type: 'set-value', tagId: 'F01.AI-0', value: 1 }))
      .toThrowError(/not connected/i);
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/stores/__tests__/realtime-store-send.test.ts 2>&1 | tail -10
```

Expected: 3 failures (no exports `sendWsMessage` / `__testHooks`).

- [ ] **Step 3: Add the helper to realtime-store.ts**

Open `packages/web-ui/src/stores/realtime-store.ts`. Append the following at the very bottom of the file (after all existing exports):

```ts
// SP-FX-2: minimal send hook for tag-binding writeTag. Keeps the WS singleton
// invariant intact — callers do not hold their own WebSocket reference.
export function sendWsMessage(msg: object): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('sendWsMessage: WebSocket not connected');
  }
  ws.send(JSON.stringify(msg));
}

// SP-FX-2: test-only hooks. Not used in production.
export const __testHooks = {
  __resetWsForTests(): void { ws = null; },
  __bindWsForTests(fakeWs: WebSocket): void { ws = fakeWs; },
};
```

- [ ] **Step 4: Run and verify GREEN**

Same command as Step 2.

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/stores/realtime-store.ts packages/web-ui/src/stores/__tests__/realtime-store-send.test.ts
git commit -m "feat(realtime-store): expose sendWsMessage for tag-binding (SP-FX-2)

Wraps the module-private WebSocket singleton with a typed send helper
that callers can use without holding their own WS reference. 3 tests
cover not-connected error + JSON serialize + readyState gate.
Companion __testHooks for resetting/binding the socket in unit tests."
```

---

## Task 3: tag-binding service (unit tests)

**Files:**
- Create: `packages/web-ui/src/scada-engine/services/tag-binding.ts`
- Create: `packages/web-ui/src/scada-engine/services/__tests__/tag-binding.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/services/__tests__/tag-binding.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRealtimeStore } from '@/stores/realtime-store';
import * as rtStore from '@/stores/realtime-store';
import { readTagSnapshot, writeTag } from '../tag-binding';

vi.mock('@/stores/realtime-store', async (importActual) => {
  const actual = await importActual<typeof rtStore>();
  return {
    ...actual,
    sendWsMessage: vi.fn(),
    useRealtimeStore: actual.useRealtimeStore,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  useRealtimeStore.setState({
    _tick: 0,
    wsConnected: true,
    reactorData: {
      F01: {
        processValues: { 'AI-0': 42 } as any,
        lastUpdateTs: Date.now(),
      } as any,
    },
  } as any);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('tag-binding readTagSnapshot (SP-FX-2)', () => {
  it('returns the current value for an existing tag', () => {
    const snap = readTagSnapshot('F01.AI-0');
    expect(snap.value).toBe(42);
    expect(snap.isStale).toBe(false);
  });

  it('returns null + isStale for unknown reactor', () => {
    const snap = readTagSnapshot('F99.AI-0');
    expect(snap.value).toBeNull();
    expect(snap.isStale).toBe(true);
  });

  it('returns null + isStale for unknown field', () => {
    const snap = readTagSnapshot('F01.MISSING');
    expect(snap.value).toBeNull();
    expect(snap.isStale).toBe(true);
  });

  it('returns isStale when ws disconnected even with cached value', () => {
    useRealtimeStore.setState({ wsConnected: false } as any);
    const snap = readTagSnapshot('F01.AI-0');
    expect(snap.isStale).toBe(true);
  });
});

describe('tag-binding writeTag (SP-FX-2)', () => {
  it('rejects when opts.confirmed is missing or false', async () => {
    await expect(writeTag('F01.AO-0_cv', 50)).rejects.toThrow(/confirmation/i);
    await expect(writeTag('F01.AO-0_cv', 50, {})).rejects.toThrow(/confirmation/i);
    await expect(writeTag('F01.AO-0_cv', 50, { confirmed: false })).rejects.toThrow(/confirmation/i);
  });

  it('sends a set-value WS message with reqId and payload', async () => {
    const promise = writeTag('F01.AO-0_cv', 50, { confirmed: true, reason: 'operator manual' });
    const sentMsg = (rtStore.sendWsMessage as any).mock.calls[0][0];
    expect(sentMsg.type).toBe('set-value');
    expect(sentMsg.tagId).toBe('F01.AO-0_cv');
    expect(sentMsg.value).toBe(50);
    expect(sentMsg.reason).toBe('operator manual');
    expect(typeof sentMsg.reqId).toBe('string');
    expect(sentMsg.reqId.length).toBeGreaterThan(0);
    // Manually dispatch the ack via the module-registered handler
    const handler = (writeTag as any).__currentAckHandler;
    handler({ reqId: sentMsg.reqId, ok: true });
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects when sendWsMessage throws (WS disconnected)', async () => {
    (rtStore.sendWsMessage as any).mockImplementationOnce(() => {
      throw new Error('WebSocket not connected');
    });
    await expect(writeTag('F01.AO-0_cv', 50, { confirmed: true })).rejects.toThrow(/not connected/i);
  });

  it('rejects after ack timeout (timeoutMs)', async () => {
    vi.useFakeTimers();
    const promise = writeTag('F01.AO-0_cv', 50, { confirmed: true, timeoutMs: 100 });
    vi.advanceTimersByTime(101);
    await expect(promise).rejects.toThrow(/timeout/i);
    vi.useRealTimers();
  });

  it('rejects when server ack ok:false', async () => {
    const promise = writeTag('F01.AO-0_cv', 50, { confirmed: true });
    const sentMsg = (rtStore.sendWsMessage as any).mock.calls[0][0];
    const handler = (writeTag as any).__currentAckHandler;
    handler({ reqId: sentMsg.reqId, ok: false, error: 'permission denied' });
    await expect(promise).rejects.toThrow(/permission denied/);
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/tag-binding.test.ts 2>&1 | tail -10
```

Expected: 10 failures (cannot resolve `../tag-binding`).

- [ ] **Step 3: Write `tag-binding.ts`**

Create `packages/web-ui/src/scada-engine/services/tag-binding.ts`:

```ts
// SP-FX-2: tag binding for scada-engine widgets.
// - useTagBinding: React hook wrapping the existing useTag hook.
// - readTagSnapshot: imperative read for non-React consumers.
// - writeTag: operator manual write — WS set-value with required confirmation + ack timeout.
//
// SAFETY: writeTag REQUIRES opts.confirmed === true. expression-eval and
// animation callers never set confirmed=true; only ConfirmDialog-driven UI
// flows set it after the operator approves. This is the editor-side
// enforcement layer of the "AI/auto never writes PLC" constraint.

import { useTag, type TagSnapshot as UseTagSnapshot, parseTagId } from '@/hooks';
import { useRealtimeStore, sendWsMessage } from '@/stores/realtime-store';

export type TagSnapshot = UseTagSnapshot;

export interface WriteOpts {
  confirmed?: boolean;
  reason?: string;
  timeoutMs?: number; // default 3000
}

const DEFAULT_TIMEOUT_MS = 3000;

const STALE: TagSnapshot = Object.freeze({ value: null, isStale: true, ageMs: Infinity });

export function useTagBinding(tagId: string, opts?: { staleMs?: number }): TagSnapshot {
  return useTag(tagId, opts);
}

export function readTagSnapshot(tagId: string): TagSnapshot {
  const parsed = parseTagId(tagId);
  if (!parsed) return STALE;
  const s = useRealtimeStore.getState();
  if (!s.wsConnected) return { value: null, isStale: true, ageMs: Infinity };
  const reactor = (s.reactorData as any)?.[parsed.reactorId];
  if (!reactor || !reactor.processValues) return STALE;
  const v = reactor.processValues[parsed.field];
  if (v === undefined || v === null) return STALE;
  const ageMs = reactor.lastUpdateTs ? Date.now() - reactor.lastUpdateTs : Infinity;
  return { value: v as number | null, isStale: false, ageMs };
}

// ── Write path ────────────────────────────────────────────────────────────

interface PendingAck {
  resolve: () => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingAck>();

function handleAck(ack: { reqId: string; ok: boolean; error?: string }): void {
  const p = pending.get(ack.reqId);
  if (!p) return;
  pending.delete(ack.reqId);
  clearTimeout(p.timer);
  if (ack.ok) p.resolve();
  else p.reject(new Error(ack.error ?? 'set-value failed'));
}

(writeTag as any).__currentAckHandler = handleAck;

let ackHandler: ((ack: { reqId: string; ok: boolean; error?: string }) => void) = handleAck;

export function registerAckHandler(fn: ((ack: { reqId: string; ok: boolean; error?: string }) => void) | null): void {
  ackHandler = fn ?? handleAck;
  (writeTag as any).__currentAckHandler = ackHandler;
}

export async function writeTag(tagId: string, value: number | string | boolean, opts: WriteOpts = {}): Promise<void> {
  if (opts.confirmed !== true) {
    throw new Error('writeTag requires explicit confirmation (opts.confirmed=true)');
  }
  const reqId = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(reqId);
      reject(new Error(`writeTag timeout after ${timeoutMs}ms (reqId=${reqId})`));
    }, timeoutMs);
    pending.set(reqId, { resolve, reject, timer });
    try {
      const payload: Record<string, unknown> = { type: 'set-value', tagId, value, reqId };
      if (opts.reason) payload.reason = opts.reason;
      sendWsMessage(payload);
    } catch (e) {
      pending.delete(reqId);
      clearTimeout(timer);
      reject(e as Error);
    }
  });
}
```

- [ ] **Step 4: Run and verify GREEN**

Same command as Step 2.

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/services/tag-binding.ts packages/web-ui/src/scada-engine/services/__tests__/tag-binding.test.ts
git commit -m "feat(scada-engine): tag-binding service (SP-FX-2)

useTagBinding (React hook pass-through), readTagSnapshot (imperative
read), writeTag (operator manual write with required confirmation +
WS set-value + ack timeout + ok:false rejection). 10 unit tests
cover read happy/stale paths + write confirm gate + WS failure +
ack timeout + ack ok:false."
```

---

## Task 4: tag-binding integration tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/services/__tests__/tag-binding.integration.test.tsx`

- [ ] **Step 1: Write the integration tests**

Create the file:

```tsx
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useTagBinding } from '../tag-binding';

function TagDisplay({ tagId }: { tagId: string }) {
  const { value, isStale } = useTagBinding(tagId);
  return (
    <div>
      <span data-testid="value">{value === null ? '—' : String(value)}</span>
      <span data-testid="stale">{isStale ? 'stale' : 'fresh'}</span>
    </div>
  );
}

beforeEach(() => {
  useRealtimeStore.setState({
    _tick: 0,
    wsConnected: true,
    reactorData: {
      F01: {
        processValues: { 'AI-0': 25 } as any,
        lastUpdateTs: Date.now(),
      } as any,
    },
  } as any);
});

describe('tag-binding integration (SP-FX-2)', () => {
  it('renders the current tag value on mount', () => {
    render(<TagDisplay tagId="F01.AI-0" />);
    expect(screen.getByTestId('value').textContent).toBe('25');
    expect(screen.getByTestId('stale').textContent).toBe('fresh');
  });

  it('rerenders when realtime-store pushes a new value via _tick', () => {
    render(<TagDisplay tagId="F01.AI-0" />);
    act(() => {
      useRealtimeStore.setState({
        _tick: Date.now(),
        reactorData: {
          F01: {
            processValues: { 'AI-0': 37 } as any,
            lastUpdateTs: Date.now(),
          } as any,
        },
      } as any);
    });
    expect(screen.getByTestId('value').textContent).toBe('37');
  });

  it('flips to stale when ws disconnects', () => {
    render(<TagDisplay tagId="F01.AI-0" />);
    expect(screen.getByTestId('stale').textContent).toBe('fresh');
    act(() => { useRealtimeStore.setState({ wsConnected: false } as any); });
    expect(screen.getByTestId('stale').textContent).toBe('stale');
  });

  it('shows — for unknown tagId without throwing', () => {
    render(<TagDisplay tagId="F99.MISSING" />);
    expect(screen.getByTestId('value').textContent).toBe('—');
    expect(screen.getByTestId('stale').textContent).toBe('stale');
  });

  it('multiple useTagBinding instances stay isolated', () => {
    useRealtimeStore.setState({
      reactorData: {
        F01: { processValues: { 'AI-0': 10, 'AI-1': 20 } as any, lastUpdateTs: Date.now() } as any,
      },
    } as any);
    render(
      <>
        <TagDisplay tagId="F01.AI-0" />
        <TagDisplay tagId="F01.AI-1" />
      </>,
    );
    const values = screen.getAllByTestId('value').map(n => n.textContent);
    expect(values).toEqual(['10', '20']);
  });
});
```

- [ ] **Step 2: Run and verify GREEN immediately**

`useTagBinding` already exists from Task 3, so no separate implementation step here.

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/tag-binding.integration.test.tsx 2>&1 | tail -10
```

Expected: 5 passed. If any fail, the bug is in the wrapper from Task 3.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/services/__tests__/tag-binding.integration.test.tsx
git commit -m "test(scada-engine): tag-binding integration with realtime-store (SP-FX-2)

5 React + jsdom integration tests cover initial render, _tick rerender,
ws-disconnect → stale flip, missing tag → '—' fallback, multi-hook
isolation."
```

---

## Task 5: editor-store

**Files:**
- Create: `packages/web-ui/src/scada-engine/services/editor-store.ts`
- Create: `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editor-store';
import type { FuxaView, FuxaWidget } from '../../models/hmi';

function makeView(overrides: Partial<FuxaView> = {}): FuxaView {
  return {
    id: 'v1', name: 'View 1', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600, items: {}, schemaVersion: 1,
    ...overrides,
  } as FuxaView;
}

function makeWidget(id = 'w1'): FuxaWidget {
  return { id, type: 'svg-ext-value', property: {} } as FuxaWidget;
}

beforeEach(() => {
  useEditorStore.setState({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
  } as any, true);
});

describe('editor-store (SP-FX-2)', () => {
  it('openView sets currentView and resets dirty + history', () => {
    const view = makeView();
    useEditorStore.getState().openView(view);
    const s = useEditorStore.getState();
    expect(s.currentView).toEqual(view);
    expect(s.isDirty).toBe(false);
    expect(s.history.past).toEqual([]);
    expect(s.history.future).toEqual([]);
    expect(s.selection).toEqual([]);
  });

  it('closeView resets everything', () => {
    useEditorStore.getState().openView(makeView());
    useEditorStore.getState().closeView();
    const s = useEditorStore.getState();
    expect(s.currentView).toBeNull();
    expect(s.isDirty).toBe(false);
    expect(s.history.past).toEqual([]);
    expect(s.selection).toEqual([]);
  });

  it('addWidget adds, marks dirty, pushes history', () => {
    useEditorStore.getState().openView(makeView());
    const before = useEditorStore.getState().currentView!;
    useEditorStore.getState().addWidget(makeWidget('w1'));
    const s = useEditorStore.getState();
    expect(s.currentView!.items['w1']).toBeDefined();
    expect(s.isDirty).toBe(true);
    expect(s.history.past.length).toBe(1);
    expect(s.history.past[0]).toEqual(before);
  });

  it('updateWidget patches one widget and marks dirty', () => {
    useEditorStore.getState().openView(makeView({ items: { w1: makeWidget('w1') } }));
    useEditorStore.getState().updateWidget('w1', { name: 'new name' } as any);
    const s = useEditorStore.getState();
    expect((s.currentView!.items['w1'] as any).name).toBe('new name');
    expect(s.isDirty).toBe(true);
  });

  it('updateWidget on missing id is a no-op (no dirty bump, no history push)', () => {
    useEditorStore.getState().openView(makeView());
    useEditorStore.getState().updateWidget('does-not-exist', { name: 'x' } as any);
    const s = useEditorStore.getState();
    expect(s.isDirty).toBe(false);
    expect(s.history.past.length).toBe(0);
  });

  it('deleteWidgets removes multiple ids', () => {
    useEditorStore.getState().openView(makeView({
      items: { w1: makeWidget('w1'), w2: makeWidget('w2'), w3: makeWidget('w3') },
    }));
    useEditorStore.getState().deleteWidgets(['w1', 'w3']);
    const s = useEditorStore.getState();
    expect(Object.keys(s.currentView!.items)).toEqual(['w2']);
    expect(s.isDirty).toBe(true);
  });

  it('undo restores the previous view, redo re-applies', () => {
    useEditorStore.getState().openView(makeView());
    useEditorStore.getState().addWidget(makeWidget('w1'));
    expect(Object.keys(useEditorStore.getState().currentView!.items)).toEqual(['w1']);
    useEditorStore.getState().undo();
    expect(Object.keys(useEditorStore.getState().currentView!.items)).toEqual([]);
    useEditorStore.getState().redo();
    expect(Object.keys(useEditorStore.getState().currentView!.items)).toEqual(['w1']);
  });

  it('undo with empty past is a no-op', () => {
    useEditorStore.getState().openView(makeView());
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().currentView).not.toBeNull();
  });

  it('a new edit clears the future stack', () => {
    useEditorStore.getState().openView(makeView());
    useEditorStore.getState().addWidget(makeWidget('w1'));
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().history.future.length).toBe(1);
    useEditorStore.getState().addWidget(makeWidget('w2'));
    expect(useEditorStore.getState().history.future).toEqual([]);
  });

  it('history.past capped at HISTORY_LIMIT (50)', () => {
    useEditorStore.getState().openView(makeView());
    for (let i = 0; i < 60; i++) useEditorStore.getState().addWidget(makeWidget(`w${i}`));
    expect(useEditorStore.getState().history.past.length).toBe(50);
  });

  it('setSelection replaces the array', () => {
    useEditorStore.getState().openView(makeView({ items: { w1: makeWidget('w1'), w2: makeWidget('w2') } }));
    useEditorStore.getState().setSelection(['w1', 'w2']);
    expect(useEditorStore.getState().selection).toEqual(['w1', 'w2']);
  });

  it('setSelection filters out missing ids', () => {
    useEditorStore.getState().openView(makeView({ items: { w1: makeWidget('w1') } }));
    useEditorStore.getState().setSelection(['w1', 'ghost', 'phantom']);
    expect(useEditorStore.getState().selection).toEqual(['w1']);
  });

  it('addToSelection appends without duplicates', () => {
    useEditorStore.getState().openView(makeView({ items: { w1: makeWidget('w1'), w2: makeWidget('w2') } }));
    useEditorStore.getState().setSelection(['w1']);
    useEditorStore.getState().addToSelection('w2');
    useEditorStore.getState().addToSelection('w2');
    expect(useEditorStore.getState().selection).toEqual(['w1', 'w2']);
  });

  it('removeFromSelection drops one id', () => {
    useEditorStore.getState().openView(makeView({ items: { w1: makeWidget('w1'), w2: makeWidget('w2') } }));
    useEditorStore.getState().setSelection(['w1', 'w2']);
    useEditorStore.getState().removeFromSelection('w1');
    expect(useEditorStore.getState().selection).toEqual(['w2']);
  });

  it('clearSelection resets to []', () => {
    useEditorStore.getState().openView(makeView({ items: { w1: makeWidget('w1') } }));
    useEditorStore.getState().setSelection(['w1']);
    useEditorStore.getState().clearSelection();
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('markClean flips isDirty=false without changing history', () => {
    useEditorStore.getState().openView(makeView());
    useEditorStore.getState().addWidget(makeWidget('w1'));
    expect(useEditorStore.getState().isDirty).toBe(true);
    useEditorStore.getState().markClean();
    const s = useEditorStore.getState();
    expect(s.isDirty).toBe(false);
    expect(s.history.past.length).toBe(1);
  });

  it('updateWidget when currentView is null is silent no-op', () => {
    expect(() => useEditorStore.getState().updateWidget('w1', { name: 'x' } as any)).not.toThrow();
    expect(useEditorStore.getState().currentView).toBeNull();
  });

  it('addWidget when currentView is null is silent no-op', () => {
    expect(() => useEditorStore.getState().addWidget(makeWidget('w1'))).not.toThrow();
    expect(useEditorStore.getState().currentView).toBeNull();
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/editor-store.test.ts 2>&1 | tail -10
```

Expected: 18 failures (no module).

- [ ] **Step 3: Write `editor-store.ts`**

Create `packages/web-ui/src/scada-engine/services/editor-store.ts`:

```ts
// SP-FX-2: editor-state store for the SCADA editor.
// Separate from the global realtime-store: this owns view + dirty + history +
// selection. Lifecycle: created when editor mounts, reset when editor unmounts
// or the user switches views.

import { create } from 'zustand';
import { produce } from 'immer';
import type { FuxaView, FuxaWidget } from '../models/hmi';

const HISTORY_LIMIT = 50;

export interface EditorState {
  currentView: FuxaView | null;
  isDirty: boolean;
  history: { past: FuxaView[]; future: FuxaView[] };
  selection: string[];
  openView: (view: FuxaView) => void;
  closeView: () => void;
  addWidget: (widget: FuxaWidget) => void;
  updateWidget: (id: string, patch: Partial<FuxaWidget>) => void;
  deleteWidgets: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  markClean: () => void;
}

function pushHistory(past: FuxaView[], snapshot: FuxaView): FuxaView[] {
  const next = [...past, snapshot];
  if (next.length > HISTORY_LIMIT) next.shift();
  return next;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  currentView: null,
  isDirty: false,
  history: { past: [], future: [] },
  selection: [],

  openView: (view) => set({
    currentView: view,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
  }),

  closeView: () => set({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
  }),

  addWidget: (widget) => {
    const { currentView } = get();
    if (!currentView) return;
    set((s) => ({
      history: { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => {
        draft.items[widget.id] = widget;
      }),
      isDirty: true,
    }));
  },

  updateWidget: (id, patch) => {
    const { currentView } = get();
    if (!currentView) return;
    if (!currentView.items[id]) return;
    set((s) => ({
      history: { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => {
        Object.assign(draft.items[id], patch);
      }),
      isDirty: true,
    }));
  },

  deleteWidgets: (ids) => {
    const { currentView } = get();
    if (!currentView) return;
    set((s) => ({
      history: { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => {
        for (const id of ids) delete draft.items[id];
      }),
      isDirty: true,
      selection: s.selection.filter((id) => !ids.includes(id)),
    }));
  },

  undo: () => {
    const { history, currentView } = get();
    if (history.past.length === 0 || !currentView) return;
    const prev = history.past[history.past.length - 1];
    set({
      currentView: prev,
      history: { past: history.past.slice(0, -1), future: [...history.future, currentView] },
      isDirty: true,
    });
  },

  redo: () => {
    const { history, currentView } = get();
    if (history.future.length === 0 || !currentView) return;
    const next = history.future[history.future.length - 1];
    set({
      currentView: next,
      history: { past: [...history.past, currentView], future: history.future.slice(0, -1) },
      isDirty: true,
    });
  },

  setSelection: (ids) => {
    const { currentView } = get();
    const valid = currentView ? ids.filter((id) => id in currentView.items) : [];
    set({ selection: valid });
  },

  addToSelection: (id) => {
    const { currentView, selection } = get();
    if (!currentView || !(id in currentView.items)) return;
    if (selection.includes(id)) return;
    set({ selection: [...selection, id] });
  },

  removeFromSelection: (id) => {
    set((s) => ({ selection: s.selection.filter((x) => x !== id) }));
  },

  clearSelection: () => set({ selection: [] }),
  markClean: () => set({ isDirty: false }),
}));
```

- [ ] **Step 4: Run and verify GREEN**

Same command as Step 2. Expected: 18 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/services/editor-store.ts packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts
git commit -m "feat(scada-engine): editor-store with undo/redo + selection (SP-FX-2)

Zustand store: currentView, isDirty, history (past/future, capped at 50),
selection (filtered to existing widgets). Immer for structural sharing.
18 tests cover open/close/add/update/delete/undo/redo/branch-clears-future
/history-cap + selection set/add/remove/clear/filter-stale + markClean
+ silent no-ops when currentView is null."
```

---

## Task 6: selection helpers

**Files:**
- Create: `packages/web-ui/src/scada-engine/services/selection.ts`
- Create: `packages/web-ui/src/scada-engine/services/__tests__/selection.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { boxIntersects, diffSelection, type Rect } from '../selection';

describe('selection.boxIntersects (SP-FX-2)', () => {
  const box: Rect = { x: 0, y: 0, w: 100, h: 100 };

  it('returns true when widget fully inside box', () => {
    expect(boxIntersects(box, { x: 10, y: 10, w: 20, h: 20 })).toBe(true);
  });

  it('returns true when widget partially intersects', () => {
    expect(boxIntersects(box, { x: 90, y: 90, w: 50, h: 50 })).toBe(true);
  });

  it('returns false when widget fully right of box', () => {
    expect(boxIntersects(box, { x: 200, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it('returns false when widget fully below box', () => {
    expect(boxIntersects(box, { x: 0, y: 200, w: 10, h: 10 })).toBe(false);
  });

  it('returns true when widget edges exactly meet box edges', () => {
    expect(boxIntersects(box, { x: 100, y: 50, w: 0, h: 0 })).toBe(true);
  });
});

describe('selection.diffSelection (SP-FX-2)', () => {
  it('reports added ids', () => {
    expect(diffSelection(['a'], ['a', 'b'])).toEqual({ added: ['b'], removed: [] });
  });

  it('reports removed ids', () => {
    expect(diffSelection(['a', 'b'], ['b'])).toEqual({ added: [], removed: ['a'] });
  });

  it('reports both added and removed', () => {
    expect(diffSelection(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/selection.test.ts 2>&1 | tail -10
```

Expected: 8 failures.

- [ ] **Step 3: Write `selection.ts`**

```ts
// SP-FX-2: pure-function selection helpers for the editor canvas (SP-FX-3+)
// and for editor-store. Stateless, easy to test in isolation.

export interface Rect { x: number; y: number; w: number; h: number; }
export interface WidgetGeom { x: number; y: number; w: number; h: number; }

export function boxIntersects(box: Rect, widget: WidgetGeom): boolean {
  return !(widget.x + widget.w < box.x ||
           widget.x > box.x + box.w ||
           widget.y + widget.h < box.y ||
           widget.y > box.y + box.h);
}

export function diffSelection(prev: string[], next: string[]): { added: string[]; removed: string[] } {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  return {
    added: next.filter((id) => !prevSet.has(id)),
    removed: prev.filter((id) => !nextSet.has(id)),
  };
}
```

- [ ] **Step 4: Run and verify GREEN**

Same command as Step 2. Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/services/selection.ts packages/web-ui/src/scada-engine/services/__tests__/selection.test.ts
git commit -m "feat(scada-engine): selection helpers (SP-FX-2)

boxIntersects (AABB inclusive) for box-select hit testing.
diffSelection (Set-based added/removed) for incremental highlight
updates. 8 tests cover inside/partial/outside/edge-touching and
added/removed permutations."
```

---

## Task 7: expression-eval

**Files:**
- Create: `packages/web-ui/src/scada-engine/services/expression-eval.ts`
- Create: `packages/web-ui/src/scada-engine/services/__tests__/expression-eval.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evalExpression, parseTagsFromExpression, __clearParseCache } from '../expression-eval';

describe('expression-eval (SP-FX-2)', () => {
  beforeEach(() => { __clearParseCache(); });

  it('evaluates simple arithmetic', () => {
    expect(evalExpression('1 + 2 * 3', {})).toBe(7);
  });

  it('evaluates with tag variables', () => {
    expect(evalExpression('temp + 10', { temp: 25 })).toBe(35);
  });

  it('evaluates comparison and logical', () => {
    expect(evalExpression('(t > 30) and (t < 80)', { t: 50 })).toBe(true);
    expect(evalExpression('a == b', { a: 1, b: 1 })).toBe(true);
  });

  it('evaluates IF function', () => {
    expect(evalExpression('IF(t < 80, 1, 0)', { t: 50 })).toBe(1);
    expect(evalExpression('IF(t < 80, 1, 0)', { t: 90 })).toBe(0);
  });

  it('evaluates MIN/MAX/ABS/ROUND', () => {
    expect(evalExpression('MIN(a, b)', { a: 5, b: 3 })).toBe(3);
    expect(evalExpression('MAX(a, b)', { a: 5, b: 3 })).toBe(5);
    expect(evalExpression('ABS(x)', { x: -7 })).toBe(7);
    expect(evalExpression('ROUND(3.7)', {})).toBe(4);
    expect(evalExpression('ROUND(3.14159, 2)', {})).toBe(3.14);
  });

  it('returns undefined for invalid syntax', () => {
    expect(evalExpression('a +', {})).toBeUndefined();
    expect(evalExpression('(a + b', {})).toBeUndefined();
    expect(evalExpression('@invalid', {})).toBeUndefined();
  });

  it('returns undefined for empty / whitespace', () => {
    expect(evalExpression('', {})).toBeUndefined();
    expect(evalExpression('   ', {})).toBeUndefined();
  });

  it('treats missing tag values as 0', () => {
    expect(evalExpression('a + 1', {})).toBe(1);
  });

  it('rejects expressions longer than 500 chars', () => {
    const huge = 'a +'.repeat(170);
    expect(huge.length).toBeGreaterThan(500);
    expect(evalExpression(huge, { a: 1 })).toBeUndefined();
  });

  it('does NOT allow member access (obj.prop)', () => {
    expect(evalExpression('obj.prop', { obj: { prop: 99 } as any })).toBeUndefined();
  });

  it('parseTagsFromExpression returns only tag identifiers, excludes safe fns', () => {
    expect(parseTagsFromExpression('IF(temp < 80, MIN(a, b), 0)').sort())
      .toEqual(['a', 'b', 'temp']);
  });

  it('parseTagsFromExpression returns [] for invalid / empty', () => {
    expect(parseTagsFromExpression('a +')).toEqual([]);
    expect(parseTagsFromExpression('')).toEqual([]);
  });

  it('parseCache makes repeat calls return the same result with different vars', () => {
    expect(evalExpression('a + b', { a: 1, b: 2 })).toBe(3);
    expect(evalExpression('a + b', { a: 10, b: 20 })).toBe(30);
    expect(evalExpression('a + b', { a: 0, b: 0 })).toBe(0);
  });

  it('emits at least one console.warn for an invalid expression', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    evalExpression('a +', {});
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/expression-eval.test.ts 2>&1 | tail -10
```

Expected: 14 failures.

- [ ] **Step 3: Write `expression-eval.ts`**

```ts
// SP-FX-2: read-only expression evaluator for SCADA gauge animations + actparam.
// Uses expr-eval with allowMemberAccess:false (prevents obj.prop / prototype pollution).
// Injects a small whitelist of safe functions (IF, MIN, MAX, ABS, ROUND).
// Caches parsed ASTs for 1Hz tick performance.
//
// SAFETY: this module has no reference to writeTag or any write API. It is
// the editor-time enforcement of the "auto/animation/expression never
// writes PLC" constraint.

import { Parser } from 'expr-eval';
import type { Expression } from 'expr-eval';

const parser = new Parser({
  operators: {
    logical: true, comparison: true, conditional: true,
    add: true, subtract: true, multiply: true, divide: true, remainder: true, power: true,
  },
  allowMemberAccess: false,
});

const SAFE_FNS: Record<string, (...args: any[]) => any> = {
  IF: (cond: boolean, a: unknown, b: unknown) => (cond ? a : b),
  MIN: (...xs: number[]) => Math.min(...xs),
  MAX: (...xs: number[]) => Math.max(...xs),
  ABS: (x: number) => Math.abs(x),
  ROUND: (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d,
};
const SAFE_FN_NAMES = new Set(Object.keys(SAFE_FNS));

const MAX_EXPR_LENGTH = 500;
const parseCache = new Map<string, Expression | null>();

export function __clearParseCache(): void {
  parseCache.clear();
}

function parseOnce(expr: string): Expression | null {
  if (parseCache.has(expr)) return parseCache.get(expr) ?? null;
  let parsed: Expression | null = null;
  try {
    parsed = parser.parse(expr);
  } catch (e) {
    parsed = null;
    console.warn(`expression-eval: parse failed: ${expr}`, (e as Error).message);
  }
  parseCache.set(expr, parsed);
  return parsed;
}

export function evalExpression(
  expr: string,
  tagValues: Record<string, number | string | boolean>,
): unknown {
  if (!expr || expr.trim() === '') return undefined;
  if (expr.length > MAX_EXPR_LENGTH) {
    console.warn(`expression-eval: rejected expression >${MAX_EXPR_LENGTH} chars`);
    return undefined;
  }
  const parsed = parseOnce(expr);
  if (!parsed) return undefined;
  try {
    return parsed.evaluate({ ...SAFE_FNS, ...tagValues });
  } catch (e) {
    console.warn(`expression-eval: evaluate failed: ${expr}`, (e as Error).message);
    return undefined;
  }
}

export function parseTagsFromExpression(expr: string): string[] {
  if (!expr || expr.trim() === '') return [];
  const parsed = parseOnce(expr);
  if (!parsed) return [];
  try {
    return parsed.variables({ withMembers: false }).filter((v: string) => !SAFE_FN_NAMES.has(v));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run and verify GREEN**

Same command as Step 2. Expected: 14 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/services/expression-eval.ts packages/web-ui/src/scada-engine/services/__tests__/expression-eval.test.ts
git commit -m "feat(scada-engine): expression-eval (expr-eval wrap, read-only) (SP-FX-2)

Wraps expr-eval with allowMemberAccess:false + 5-function safe whitelist
(IF/MIN/MAX/ABS/ROUND). Caches parsed ASTs. Rejects expressions >500
chars + treats missing tags as 0 + downgrades all parse/eval errors to
undefined (never throws into React rerender). 14 tests cover arithmetic
/comparison/logical/IF/MIN/MAX/ABS/ROUND/invalid syntax/empty/missing-tag
/length-limit/no-member-access/parseTagsFromExpression/cache reuse."
```

---

## Task 8: FUXA expression fixtures validation (R1 stop-condition gate)

**Files:**
- Create: `packages/web-ui/src/scada-engine/services/__tests__/expression-eval.fuxa-fixtures.test.ts`

**Why this task exists:** Spec §6.1 R1 + §6.2 stop-condition #1: if more than 30% of FUXA fixture expressions fail with expr-eval, switch to a custom evaluator.

- [ ] **Step 1: Write the validation test**

```ts
import { describe, it, expect } from 'vitest';
import { evalExpression } from '../expression-eval';
import { VALID_EXPRESSIONS, INVALID_EXPRESSIONS } from '@/test/exprFixtures';

describe('expression-eval FUXA fixtures (SP-FX-2 R1 gate)', () => {
  it('VALID fixtures: ≥70% produce a defined result and match expected when given', () => {
    let passed = 0;
    const failures: string[] = [];
    for (const { expr, vars = {}, expected, label } of VALID_EXPRESSIONS) {
      const result = evalExpression(expr, vars);
      const ok = result !== undefined && (expected === undefined || result === expected);
      if (ok) passed++;
      else failures.push(`${label ?? expr}: got=${JSON.stringify(result)} want=${JSON.stringify(expected)}`);
    }
    const ratio = passed / VALID_EXPRESSIONS.length;
    if (passed < VALID_EXPRESSIONS.length) {
      // eslint-disable-next-line no-console
      console.warn(`expression-eval: ${VALID_EXPRESSIONS.length - passed} fixtures failed:\n  ${failures.join('\n  ')}`);
    }
    if (ratio < 0.7) {
      throw new Error(
        `R1 stop condition: only ${passed}/${VALID_EXPRESSIONS.length} (${(ratio * 100).toFixed(1)}%) ` +
        `of FUXA fixtures passed. Switch to custom evaluator or shrink supported syntax.`,
      );
    }
    expect(passed).toBeGreaterThanOrEqual(Math.ceil(VALID_EXPRESSIONS.length * 0.7));
  });

  it('INVALID fixtures: all return undefined (or non-finite numbers like Infinity/NaN); none throw', () => {
    const escapees: string[] = [];
    for (const { expr, vars = {}, label } of INVALID_EXPRESSIONS) {
      let result: unknown;
      let threw = false;
      try { result = evalExpression(expr, vars); } catch { threw = true; }
      if (threw) escapees.push(`${label ?? expr}: threw`);
      else if (result !== undefined && !(typeof result === 'number' && !isFinite(result))) {
        escapees.push(`${label ?? expr}: returned ${JSON.stringify(result)} (expected undefined)`);
      }
    }
    if (escapees.length) {
      throw new Error(`INVALID fixtures must downgrade to undefined.\n  ${escapees.join('\n  ')}`);
    }
  });
});
```

- [ ] **Step 2: Run and verify**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/expression-eval.fuxa-fixtures.test.ts 2>&1 | tail -20
```

Outcomes:
- **PASS:** R1 NOT triggered. Proceed.
- **FAIL (≥30% invalid):** STOP. Per stop condition 1: either remove problematic fixtures from `exprFixtures.ts` and document the syntax gap in spec §6.3 (preferred minimal action) or switch evaluator (multi-day rework).

- [ ] **Step 3: Commit (passing case)**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/services/__tests__/expression-eval.fuxa-fixtures.test.ts
git commit -m "test(scada-engine): FUXA expression fixture validation (SP-FX-2 R1 gate)

Validates ≥70% of FUXA-style expressions evaluate correctly and all
invalid fixtures downgrade to undefined. Implements R1 stop condition
from spec §6.2: <70% triggers switch to custom evaluator."
```

If failing: STOP and surface to user; do not proceed.

---

## Task 9: Patch FuxaEventSchema (requireConfirm field)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/models/property.ts`
- Modify: `packages/web-ui/src/scada-engine/models/__tests__/hmi.test.ts`

- [ ] **Step 1: Inspect the current schema**

```bash
cd /Volumes/SSD/projects/BIOCore
grep -n "FuxaEventSchema\b" packages/web-ui/src/scada-engine/models/property.ts | head -5
```

Expected: find the existing `export const FuxaEventSchema = z.object({...})` definition from SP-FX-1 Task 4.

- [ ] **Step 2: Patch the schema**

Open `packages/web-ui/src/scada-engine/models/property.ts`. Locate the `FuxaEventSchema = z.object({` declaration. Add one new field as the last property of the object literal (preserve existing fields exactly):

```ts
  // SP-FX-2: when true (default), set-value actions require ConfirmDialog
  // approval before writeTag fires. Designer can set false on view-property
  // dialog for high-frequency manual controls.
  requireConfirm: z.boolean().optional().default(true),
```

Backward-compatible: existing JSON without the field auto-fills `requireConfirm:true`. No `schemaVersion` bump needed.

- [ ] **Step 3: Add the two new tests**

Open `packages/web-ui/src/scada-engine/models/__tests__/hmi.test.ts`. Locate the existing describe block that covers `FuxaEventSchema`. Append at the end of that describe:

```ts
it('FuxaEventSchema requireConfirm defaults to true when omitted', () => {
  const parsed = FuxaEventSchema.parse({
    type: 'click', action: 'set-value', actparam: 'F01.AO-0_cv',
  });
  expect(parsed.requireConfirm).toBe(true);
});

it('FuxaEventSchema requireConfirm honors explicit false', () => {
  const parsed = FuxaEventSchema.parse({
    type: 'click', action: 'set-value', actparam: 'F01.AO-0_cv', requireConfirm: false,
  });
  expect(parsed.requireConfirm).toBe(false);
});
```

If `FuxaEventSchema` is not yet imported at the top of the test file, add it to the existing import line.

- [ ] **Step 4: Run and verify**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/models/__tests__/hmi.test.ts 2>&1 | tail -10
```

Expected: 15 passed (was 13; +2 new tests, the SP-FX-1 13 unchanged).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/models/property.ts packages/web-ui/src/scada-engine/models/__tests__/hmi.test.ts
git commit -m "feat(scada-engine): FuxaEventSchema add requireConfirm field (SP-FX-2)

Backward-compatible: zod .optional().default(true) means existing FUXA
view JSON without the field parses with requireConfirm:true, matching
spec §1.2 confirm-by-default safety constraint. +2 tests for default
fill + explicit false; SP-FX-1 13/13 still pass (now 15/15)."
```

---

## Task 10: ConfirmDialog

**Files:**
- Create: `packages/web-ui/src/scada-engine/dialogs/ConfirmDialog.tsx`
- Create: `packages/web-ui/src/scada-engine/dialogs/__tests__/ConfirmDialog.test.tsx`

- [ ] **Step 1: Inspect the existing Dialog primitive**

```bash
cd /Volumes/SSD/projects/BIOCore
head -80 packages/web-ui/src/components/ui/dialog.tsx
```

Expected: `Dialog` (open + onOpenChange) + `DialogContent` slot. Re-use these.

- [ ] **Step 2: Write the failing tests**

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog (SP-FX-2)', () => {
  it('renders title and message when open', () => {
    render(<ConfirmDialog open title="确认下发" message="将温度设为 80°C ?" onConfirm={() => {}} />);
    expect(screen.getByText('确认下发')).toBeInTheDocument();
    expect(screen.getByText('将温度设为 80°C ?')).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    render(<ConfirmDialog open={false} title="x" message="y" onConfirm={() => {}} />);
    expect(screen.queryByText('x')).not.toBeInTheDocument();
  });

  it('clicking confirm triggers onConfirm', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="t" message="m" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /确认/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('clicking cancel triggers onCancel when provided', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="t" message="m" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /取消/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders danger styling when danger=true', () => {
    render(<ConfirmDialog open title="t" message="m" danger onConfirm={() => {}} />);
    const confirmBtn = screen.getByRole('button', { name: /确认/i });
    expect(confirmBtn.className).toMatch(/destructive|red|danger/i);
  });
});
```

- [ ] **Step 3: Run and verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/dialogs/__tests__/ConfirmDialog.test.tsx 2>&1 | tail -10
```

Expected: 5 failures.

- [ ] **Step 4: Write `ConfirmDialog.tsx`**

```tsx
'use client';
import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open, title, message,
  confirmLabel = '确认', cancelLabel = '取消',
  danger = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel?.(); }}>
      <DialogContent className="max-w-md rounded-lg bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded border border-border text-sm hover:bg-muted"
            onClick={() => onCancel?.()}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              danger
                ? 'px-4 py-2 rounded text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'px-4 py-2 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90'
            }
            onClick={() => onConfirm()}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run and verify GREEN**

Same command as Step 3. Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/dialogs/ConfirmDialog.tsx packages/web-ui/src/scada-engine/dialogs/__tests__/ConfirmDialog.test.tsx
git commit -m "feat(scada-engine): ConfirmDialog (SP-FX-2)

Reuses project Dialog primitive at @/components/ui/dialog. Props for
title/message/confirm+cancel labels/danger styling/onConfirm+onCancel.
5 tests cover open/closed/confirm/cancel/danger."
```

---

## Task 11: SectionMessageDialog

**Files:**
- Create: `packages/web-ui/src/scada-engine/dialogs/SectionMessageDialog.tsx`
- Create: `packages/web-ui/src/scada-engine/dialogs/__tests__/SectionMessageDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SectionMessageDialog } from '../SectionMessageDialog';

describe('SectionMessageDialog (SP-FX-2)', () => {
  it('renders title + message when open', () => {
    render(<SectionMessageDialog open level="info" title="提示" message="保存成功" onClose={() => {}} />);
    expect(screen.getByText('提示')).toBeInTheDocument();
    expect(screen.getByText('保存成功')).toBeInTheDocument();
  });

  it('renders error level data-attribute', () => {
    const { container } = render(
      <SectionMessageDialog open level="error" title="错误" message="网络断开" onClose={() => {}} />,
    );
    expect(container.querySelector('[data-level="error"]')).not.toBeNull();
  });

  it('renders warn level data-attribute', () => {
    const { container } = render(
      <SectionMessageDialog open level="warn" title="警告" message="版本冲突" onClose={() => {}} />,
    );
    expect(container.querySelector('[data-level="warn"]')).not.toBeNull();
  });

  it('clicking close triggers onClose', () => {
    const onClose = vi.fn();
    render(<SectionMessageDialog open level="info" title="t" message="m" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /关闭/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/dialogs/__tests__/SectionMessageDialog.test.tsx 2>&1 | tail -10
```

Expected: 4 failures.

- [ ] **Step 3: Write `SectionMessageDialog.tsx`**

```tsx
'use client';
import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export type MessageLevel = 'info' | 'warn' | 'error';

export interface SectionMessageDialogProps {
  open: boolean;
  level: MessageLevel;
  title: string;
  message: string;
  onClose: () => void;
}

const LEVEL_STYLES: Record<MessageLevel, { icon: string; ring: string }> = {
  info:  { icon: 'ℹ', ring: 'border-blue-500/30' },
  warn:  { icon: '⚠', ring: 'border-amber-500/40' },
  error: { icon: '✕', ring: 'border-red-500/50' },
};

export function SectionMessageDialog({ open, level, title, message, onClose }: SectionMessageDialogProps) {
  const style = LEVEL_STYLES[level];
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        data-level={level}
        className={`max-w-md rounded-lg bg-background p-6 shadow-lg border-2 ${style.ring}`}
      >
        <h2 className="text-lg font-semibold mb-2">
          <span className="mr-2">{style.icon}</span>{title}
        </h2>
        <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap">{message}</p>
        <div className="flex justify-end">
          <button
            type="button"
            className="px-4 py-2 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run and verify GREEN**

Same command as Step 2. Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/dialogs/SectionMessageDialog.tsx packages/web-ui/src/scada-engine/dialogs/__tests__/SectionMessageDialog.test.tsx
git commit -m "feat(scada-engine): SectionMessageDialog (SP-FX-2)

Modal info/warn/error dialog used for save conflicts, write failures,
expression errors. 4 tests cover render + three levels + close."
```

---

## Task 12: ViewPropertyDialog (zod form)

**Files:**
- Create: `packages/web-ui/src/scada-engine/dialogs/ViewPropertyDialog.tsx`
- Create: `packages/web-ui/src/scada-engine/dialogs/__tests__/ViewPropertyDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewPropertyDialog } from '../ViewPropertyDialog';
import type { FuxaView } from '../../models/hmi';

function baseView(): FuxaView {
  return {
    id: 'v1', name: 'My View', type: 'svg', svgcontent: '<svg/>',
    width: 1024, height: 768, items: {}, schemaVersion: 1,
  } as FuxaView;
}

describe('ViewPropertyDialog (SP-FX-2)', () => {
  it('renders existing view values as initial form state', () => {
    render(<ViewPropertyDialog open view={baseView()} onSave={() => {}} onCancel={() => {}} />);
    expect((screen.getByLabelText(/名称/) as HTMLInputElement).value).toBe('My View');
    expect((screen.getByLabelText(/宽度/) as HTMLInputElement).value).toBe('1024');
    expect((screen.getByLabelText(/高度/) as HTMLInputElement).value).toBe('768');
  });

  it('Save disabled when name empty', () => {
    render(<ViewPropertyDialog open view={baseView()} onSave={() => {}} onCancel={() => {}} />);
    const name = screen.getByLabelText(/名称/) as HTMLInputElement;
    fireEvent.change(name, { target: { value: '' } });
    expect((screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Save disabled when width is 0 or negative', () => {
    render(<ViewPropertyDialog open view={baseView()} onSave={() => {}} onCancel={() => {}} />);
    const width = screen.getByLabelText(/宽度/) as HTMLInputElement;
    fireEvent.change(width, { target: { value: '0' } });
    expect((screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(width, { target: { value: '-10' } });
    expect((screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Save enabled when all fields valid', () => {
    render(<ViewPropertyDialog open view={baseView()} onSave={() => {}} onCancel={() => {}} />);
    expect((screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('clicking Save invokes onSave with the patch', () => {
    const onSave = vi.fn();
    render(<ViewPropertyDialog open view={baseView()} onSave={onSave} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/名称/), { target: { value: 'Renamed' } });
    fireEvent.change(screen.getByLabelText(/宽度/), { target: { value: '1280' } });
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const patch = onSave.mock.calls[0][0];
    expect(patch).toMatchObject({ name: 'Renamed', width: 1280, height: 768 });
  });

  it('clicking Cancel triggers onCancel and not onSave', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<ViewPropertyDialog open view={baseView()} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /取消/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/dialogs/__tests__/ViewPropertyDialog.test.tsx 2>&1 | tail -10
```

Expected: 6 failures.

- [ ] **Step 3: Write `ViewPropertyDialog.tsx`**

```tsx
'use client';
import React, { useState } from 'react';
import { z } from 'zod';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { FuxaView } from '../models/hmi';

export interface ViewPropertyPatch {
  name: string;
  width: number;
  height: number;
  background_color?: string;
}

export const ViewPropertyPatchSchema = z.object({
  name: z.string().min(1, '视图名称必填'),
  width: z.number().int().positive('宽度必须 > 0'),
  height: z.number().int().positive('高度必须 > 0'),
  background_color: z.string().optional(),
});

export interface ViewPropertyDialogProps {
  open: boolean;
  view: FuxaView;
  onSave: (patch: ViewPropertyPatch) => void;
  onCancel: () => void;
}

export function ViewPropertyDialog({ open, view, onSave, onCancel }: ViewPropertyDialogProps) {
  const [name, setName] = useState(view.name);
  const [width, setWidth] = useState(String(view.width));
  const [height, setHeight] = useState(String(view.height));
  const [bg, setBg] = useState((view as any).background_color ?? '');

  const candidate = {
    name,
    width: Number(width),
    height: Number(height),
    ...(bg ? { background_color: bg } : {}),
  };
  const validation = ViewPropertyPatchSchema.safeParse(candidate);
  const isValid = validation.success;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md rounded-lg bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">视图属性</h2>

        <div className="space-y-3">
          <div>
            <label htmlFor="vp-name" className="block text-sm font-medium mb-1">名称</label>
            <input id="vp-name" aria-label="名称" type="text"
              value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-border bg-background text-sm" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="vp-w" className="block text-sm font-medium mb-1">宽度 (px)</label>
              <input id="vp-w" aria-label="宽度" type="number"
                value={width} onChange={(e) => setWidth(e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-border bg-background text-sm" />
            </div>
            <div className="flex-1">
              <label htmlFor="vp-h" className="block text-sm font-medium mb-1">高度 (px)</label>
              <input id="vp-h" aria-label="高度" type="number"
                value={height} onChange={(e) => setHeight(e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-border bg-background text-sm" />
            </div>
          </div>
          <div>
            <label htmlFor="vp-bg" className="block text-sm font-medium mb-1">背景色 (可选)</label>
            <input id="vp-bg" aria-label="背景色" type="text" placeholder="#ffffff"
              value={bg} onChange={(e) => setBg(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-border bg-background text-sm font-mono" />
          </div>
          {!isValid && (
            <div className="text-xs text-red-600">{validation.error.issues[0]?.message}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button"
            className="px-4 py-2 rounded border border-border text-sm hover:bg-muted"
            onClick={onCancel}>取消</button>
          <button type="button" disabled={!isValid}
            className="px-4 py-2 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => isValid && onSave(validation.data)}>保存</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run and verify GREEN**

Same command as Step 2. Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/dialogs/ViewPropertyDialog.tsx packages/web-ui/src/scada-engine/dialogs/__tests__/ViewPropertyDialog.test.tsx
git commit -m "feat(scada-engine): ViewPropertyDialog with zod form (SP-FX-2)

Edits view name/width/height/background_color with live zod validation
(name min 1, width/height int positive). Save button gated on isValid.
6 tests cover initial fill, three invalid-field disabling cases,
save-with-patch, cancel-no-save."
```

---

## Task 13: FileUploadDialog

**Files:**
- Create: `packages/web-ui/src/scada-engine/dialogs/FileUploadDialog.tsx`
- Create: `packages/web-ui/src/scada-engine/dialogs/__tests__/FileUploadDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUploadDialog } from '../FileUploadDialog';

function makeFile(name: string, size: number, type = 'image/svg+xml'): File {
  const f = new File(['x'.repeat(size)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('FileUploadDialog (SP-FX-2)', () => {
  it('renders the choose-file label', () => {
    render(<FileUploadDialog open accept=".svg" onUpload={async () => {}} onCancel={() => {}} />);
    expect(screen.getByText(/选择文件/i)).toBeInTheDocument();
  });

  it('rejects files larger than maxSizeBytes inline', async () => {
    const onUpload = vi.fn(async () => {});
    render(<FileUploadDialog open accept=".svg" maxSizeBytes={1024} onUpload={onUpload} onCancel={() => {}} />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('big.svg', 2048)] } });
    await waitFor(() => expect(screen.getByText(/文件过大/i)).toBeInTheDocument());
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('calls onUpload with the file array on valid selection', async () => {
    const onUpload = vi.fn(async () => {});
    render(<FileUploadDialog open accept=".svg" onUpload={onUpload} onCancel={() => {}} />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('ok.svg', 500)] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload.mock.calls[0][0][0].name).toBe('ok.svg');
  });

  it('shows error message when onUpload rejects', async () => {
    const onUpload = vi.fn(async () => { throw new Error('网络断开'); });
    render(<FileUploadDialog open accept=".svg" onUpload={onUpload} onCancel={() => {}} />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('a.svg', 100)] } });
    await waitFor(() => expect(screen.getByText(/网络断开/)).toBeInTheDocument());
  });

  it('accepts multiple files when multiple=true', async () => {
    const onUpload = vi.fn(async () => {});
    render(<FileUploadDialog open accept=".svg" multiple onUpload={onUpload} onCancel={() => {}} />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    fireEvent.change(input, { target: { files: [makeFile('a.svg', 100), makeFile('b.svg', 100)] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload.mock.calls[0][0]).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/dialogs/__tests__/FileUploadDialog.test.tsx 2>&1 | tail -10
```

Expected: 5 failures.

- [ ] **Step 3: Write `FileUploadDialog.tsx`**

```tsx
'use client';
import React, { useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export interface FileUploadDialogProps {
  open: boolean;
  accept?: string;
  multiple?: boolean;
  maxSizeBytes?: number;
  onUpload: (files: File[]) => Promise<void>;
  onCancel: () => void;
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;

export function FileUploadDialog({
  open, accept, multiple = false,
  maxSizeBytes = DEFAULT_MAX_SIZE, onUpload, onCancel,
}: FileUploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const tooBig = files.find((f) => f.size > maxSizeBytes);
    if (tooBig) {
      setError(`文件过大: ${tooBig.name} (${(tooBig.size / 1024).toFixed(0)} KB > ${(maxSizeBytes / 1024).toFixed(0)} KB)`);
      return;
    }
    setBusy(true);
    try {
      await onUpload(files);
    } catch (err) {
      setError((err as Error).message ?? '上传失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md rounded-lg bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">选择文件</h2>
        <input
          ref={inputRef}
          data-testid="file-input"
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="block text-sm"
        />
        {busy && <div className="mt-3 text-sm text-muted-foreground">上传中…</div>}
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end mt-5">
          <button type="button"
            className="px-4 py-2 rounded border border-border text-sm hover:bg-muted"
            onClick={onCancel} disabled={busy}>取消</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run and verify GREEN**

Same command as Step 2. Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/dialogs/FileUploadDialog.tsx packages/web-ui/src/scada-engine/dialogs/__tests__/FileUploadDialog.test.tsx
git commit -m "feat(scada-engine): FileUploadDialog (SP-FX-2)

Native <input type=file> wrapped in project Dialog. Enforces
maxSizeBytes (default 10MB), passes File[] to onUpload, surfaces
async errors inline. 5 tests cover label, oversize rejection,
valid upload, async error display, multi-file."
```

---

## Task 14: barrel index + tsc full pass

**Files:**
- Create: `packages/web-ui/src/scada-engine/services/index.ts`
- Create: `packages/web-ui/src/scada-engine/dialogs/index.ts`
- Modify: `packages/web-ui/src/scada-engine/index.ts`

- [ ] **Step 1: Create `services/index.ts`**

```ts
// SP-FX-2: services barrel
export {
  useTagBinding,
  readTagSnapshot,
  writeTag,
  registerAckHandler,
  type TagSnapshot,
  type WriteOpts,
} from './tag-binding';

export {
  useEditorStore,
  type EditorState,
} from './editor-store';

export {
  boxIntersects,
  diffSelection,
  type Rect,
  type WidgetGeom,
} from './selection';

export {
  evalExpression,
  parseTagsFromExpression,
} from './expression-eval';
```

- [ ] **Step 2: Create `dialogs/index.ts`**

```ts
// SP-FX-2: dialogs barrel
export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';
export { SectionMessageDialog, type SectionMessageDialogProps, type MessageLevel } from './SectionMessageDialog';
export {
  ViewPropertyDialog,
  ViewPropertyPatchSchema,
  type ViewPropertyDialogProps,
  type ViewPropertyPatch,
} from './ViewPropertyDialog';
export { FileUploadDialog, type FileUploadDialogProps } from './FileUploadDialog';
```

- [ ] **Step 3: Update `scada-engine/index.ts` to re-export the two barrels**

Open `packages/web-ui/src/scada-engine/index.ts`. Append (keep all existing SP-FX-1 exports above):

```ts
// SP-FX-2 additions
export * from './services';
export * from './dialogs';
```

- [ ] **Step 4: tsc across web-ui**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | tail -20
```

Expected: empty output (no errors). If a barrel re-export collides with an SP-FX-1 export (unlikely with the namespacing here), narrow the barrel to explicit identifier lists.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/services/index.ts packages/web-ui/src/scada-engine/dialogs/index.ts packages/web-ui/src/scada-engine/index.ts
git commit -m "feat(scada-engine): barrel re-exports for services + dialogs (SP-FX-2)

services/index.ts + dialogs/index.ts + main index.ts barrel pull
SP-FX-2 into the public scada-engine surface. tsc clean across web-ui."
```

---

## Task 15: Regression + push

**Files:** none (verification only)

- [ ] **Step 1: web-ui vitest full suite**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run 2>&1 | tail -8
```

Expected: 390 + 77 ≈ **467 passing** (10 tag-binding unit + 5 integration + 18 editor-store + 8 selection + 14 expression-eval + 2 fuxa-fixtures + 2 hmi schema + 3 sendWsMessage + 5+4+6+5 dialogs). Zero failures.

If a previously-green test (e.g. SP-FX-1 hmi) breaks because `requireConfirm` default tripped strict-mode, STOP and fix before push.

- [ ] **Step 2: server + data-service regression sweeps**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run 2>&1 | tail -5
pnpm --filter @biocore/data-service exec vitest run 2>&1 | tail -5
```

Expected: server 147/147 unchanged, data-service 84/84 unchanged.

- [ ] **Step 3: tsc across web-ui**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 4: Push**

```bash
cd /Volumes/SSD/projects/BIOCore
git push origin main 2>&1 | tail -5
```

Expected: push succeeds. SP-FX-2 ships as ~13 atomic commits.

---

## Self-Review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| §1.1 4 services + 4 dialogs file structure | T3 / T5 / T6 / T7 + T10 / T11 / T12 / T13 |
| §1.2 Constraint 1 (expression-eval read-only) | T7 (module has no writeTag reference) |
| §1.2 Constraint 2 (operator manual WS path) | T2 (sendWsMessage) + T3 (writeTag) |
| §1.2 Constraint 3 (requireConfirm default true) | T9 |
| §1.3 web-ui +75 tests (target ~465) | actual +77 → ~467 (T1+T2+T3+T4+T5+T6+T7+T8+T9+T10+T11+T12+T13) |
| §1.4 expr-eval + immer; Radix replaced by existing Dialog primitive | T1 (deps) + T10-T13 use `@/components/ui/dialog` |
| §2.1 tag-binding (useTagBinding/readTagSnapshot/writeTag) | T3 |
| §2.2 editor-store (zustand + immer + history) | T5 |
| §2.3 expression-eval (expr-eval + whitelist + parseCache) | T7 |
| §2.4 selection helpers | T6 |
| §2.5 4 dialogs | T10-T13 |
| §2.6 FuxaEventSchema patch (requireConfirm) | T9 |
| §3.1-§3.5 data flow | informational; covered by T3/T5/T7/T6 |
| §4 error handling | T3/T5/T7 + T10-T13 |
| §5 testing | every task has TDD steps; T15 final regression |
| §6.1 R1 | T8 gate |
| §6.1 R2 | T3 mocks ack |
| §6.1 R3 | T5 history cap |
| §6.1 R4 | deferred to SP-FX-7 |
| §6.1 R5 | project Dialog reused, no Radix portal added |
| §6.1 R6 | project Dialog supports nesting |
| §6.1 R7 | T13 maxSizeBytes default 10MB |
| §6.1 R8 | T7 parseCache |
| §6.1 R9 | T9 zod default true |
| §6.2 stop conditions | T8 step 3 STOP gate; others surface as failed task |
| §6.3 deferred items | not in plan by design |
| §7 acceptance criteria | T15 |

**Placeholder scan:** none — every code step has a complete code block; every test has assertions; every command has an expected outcome.

**Type consistency:**
- `TagSnapshot` is `{ value: number | null, isStale, ageMs }` everywhere (matches existing `useTag`).
- `WriteOpts` shape consistent across T3 and T14 barrel.
- `EditorState` interface declared in T5, re-exported in T14.
- `ViewPropertyPatch` with `name/width/height/background_color?` is consistent across T12 schema/form/tests/barrel.
- `MessageLevel` `'info' | 'warn' | 'error'` consistent T11 + barrel.
- `FuxaEvent.requireConfirm` added in T9, consumed in spec §1.2 / §3.2 by SP-FX-6/7 widgets (out of this plan's scope but interface is locked).

**Execution Handoff**

Plan complete and saved to `docs/superpowers/plans/2026-05-17-fuxa-scada-sp-fx-2-services-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task + spec/code review between tasks
2. **Inline Execution** — execute tasks in this session with executing-plans, batch checkpoints

Which approach?
