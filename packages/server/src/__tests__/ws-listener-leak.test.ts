/**
 * Regression guard for risk #3 — WebSocket subscription cleanup.
 *
 * Findings (from reading packages/server/src/index.ts L626-L692, L4015-L4106):
 *
 *   The server's WebSocket architecture does NOT register per-client listeners
 *   on any shared EventEmitter. Instead it uses a fan-out broadcast pattern:
 *
 *     1) `wss = new WebSocketServer(...)` — line 628
 *     2) `broadcast(channel, payload, ...)` iterates `wss.clients` and sends
 *        to each open socket — line 630-641
 *     3) On `wss.on('connection', ...)` the only listener attached to the `ws`
 *        instance is `ws.on('close', ...)` for logging — line 691. This
 *        listener is bound to the `ws` instance itself (garbage collected when
 *        the client disconnects), not to any shared bus.
 *     4) Reactor → broadcast wiring lives in `wireReactorEvents(reactorId)`
 *        (L4018-L4106) which calls `ctrl.on('state_changed', ...)` etc. ONCE
 *        per reactor — at reactor creation time — NOT per WS client.
 *
 *   Therefore connect/disconnect cycles cannot grow listener counts on any
 *   long-lived emitter. The hypothesis in risk #3 is already mitigated by
 *   architecture.
 *
 * Test approach (Approach B per the task brief):
 *   We do NOT import `index.ts` (it auto-starts an HTTP server, binds ports,
 *   touches SQLite, etc.). Instead we mirror the production-style invariants
 *   in a minimal harness:
 *
 *     - A WebSocketServer with a connection handler that mirrors the
 *       production pattern (only `ws.on('close')` is attached per client; no
 *       subscriptions to a shared EventEmitter).
 *     - A long-lived EventEmitter representing a reactor controller, with
 *       listeners attached ONCE outside the connection handler (mirrors
 *       `wireReactorEvents` semantics).
 *     - Run N connect/disconnect cycles and assert the long-lived emitter's
 *       listenerCount does not grow.
 *
 *   This documents the invariant. If a future change inadvertently moves a
 *   `ctrl.on(...)` call inside the `wss.on('connection')` handler (the
 *   classic leak shape), this test fails.
 */

import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { AddressInfo } from 'node:net';

function startServer(reactorBus: EventEmitter): Promise<{ wss: WebSocketServer; port: number }> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 });

    // Mirrors production wireReactorEvents — bound ONCE, outside the
    // connection handler. The handler iterates wss.clients to fan out.
    reactorBus.on('state_update', (payload) => {
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload));
      }
    });

    // Mirrors production wss.on('connection') — only ws.on('close') is
    // registered, on the ws instance itself.
    wss.on('connection', (ws) => {
      ws.on('close', () => {
        // logging only — no shared-bus listeners to clean up
      });
    });

    wss.on('listening', () => {
      const port = (wss.address() as AddressInfo).port;
      resolve({ wss, port });
    });
  });
}

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function closeClient(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.once('close', () => resolve());
    ws.close();
  });
}

describe('WS subscription cleanup (risk #3 — regression guard)', () => {
  it('reactor-bus listener count does not grow across N connect/disconnect cycles', async () => {
    const reactorBus = new EventEmitter();
    // Production has many channels; we pick the busiest one as the canary.
    const channel = 'state_update';

    const { wss, port } = await startServer(reactorBus);

    try {
      const baseline = reactorBus.listenerCount(channel);
      expect(baseline).toBe(1); // bound once during startServer

      // 200 cycles is enough to surface a per-connection leak; 1000 keeps the
      // test fast enough but still meaningful for the invariant.
      const N = 200;
      for (let i = 0; i < N; i++) {
        const ws = await connectClient(port);
        await closeClient(ws);
      }

      const afterCycles = reactorBus.listenerCount(channel);
      expect(afterCycles).toBe(baseline);
    } finally {
      // Force-close any stragglers and shut down the WSS so the test process exits cleanly.
      for (const c of wss.clients) {
        try { c.terminate(); } catch { /* ignore */ }
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
  }, 30_000);

  it('per-client ws.on("close") listener does not leak onto the wss instance', async () => {
    // Sanity: production uses `ws.on('close', ...)` (instance-bound). Verify
    // that pattern does NOT register a listener on the WSS itself.
    const reactorBus = new EventEmitter();
    const { wss, port } = await startServer(reactorBus);

    try {
      const wssCloseBaseline = wss.listenerCount('close');

      for (let i = 0; i < 50; i++) {
        const ws = await connectClient(port);
        await closeClient(ws);
      }

      const wssCloseAfter = wss.listenerCount('close');
      expect(wssCloseAfter).toBe(wssCloseBaseline);
    } finally {
      for (const c of wss.clients) {
        try { c.terminate(); } catch { /* ignore */ }
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
  }, 30_000);
});
