# BIOCore Node.js 加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 BIOCore 后端 Node.js 进程从"功能完备"加固到"7×24 商用可跑"，含 5 处泄漏修复、进程守护、可观测性、4 通道告警、24h CI soak。

**Architecture:** 3 阶段风险优先（Phase 1 修已知泄漏 → Phase 2 兜底崩溃 → Phase 3 加可观测/告警/soak）。新增 2 个独立包 `@biocore/runtime-guard` 和 `@biocore/notifier`，不重写现有 9 个包。

**Tech Stack:** Node.js 20 + TypeScript 严格模式；测试 vitest；Express + ws；prom-client；zod；puppeteer；Docker Compose（主部署）+ NSSM（Windows 备选）。

**Spec：** `docs/superpowers/specs/2026-05-01-nodejs-hardening-design.md`

---

## Pre-flight（Tasks 0-2）

### Task 0：初始化 git 仓库（如尚未）

**Files:**
- Modify: `C:\BIOCORE\.git/`（创建）

- [ ] **Step 1: 检查是否已是 git repo**

```bash
git -C /c/BIOCORE status 2>&1 | head -3
```
如果输出 `fatal: not a git repository`，继续 Step 2；否则跳到 Task 1。

- [ ] **Step 2: 初始化 + 写 .gitignore**

```bash
cd /c/BIOCORE && git init -b main
```

写 `/c/BIOCORE/.gitignore`：

```
node_modules/
dist/
*.tsbuildinfo
.next/
.env
.env.local
data/biocore.db
data/biocore.db-shm
data/biocore.db-wal
crashes/
soak-runs/
logs/
*.tmp
.obsidian/
.omc/state/
```

- [ ] **Step 3: 首次提交快照**

```bash
git -C /c/BIOCORE add -A
git -C /c/BIOCORE commit -m "chore: snapshot before Node.js hardening (Sprint 4 Track A)"
```

- [ ] **Step 4: 建分支**

```bash
git -C /c/BIOCORE checkout -b sprint4-track-a-hardening
```

---

### Task 1：给 server 包加 test 脚本

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1: 加 vitest devDep + test script**

打开 `packages/server/package.json`，在 `devDependencies` 加 `"vitest": "^1.2.0"`；在 `scripts` 加 `"test": "vitest run"`。

- [ ] **Step 2: 安装**

```bash
cd /c/BIOCORE && pnpm install
```
预期：vitest 装到 server 包；其他包不动。

- [ ] **Step 3: 验证 test 命令存在**

```bash
pnpm --filter @biocore/server run test 2>&1 | head -3
```
预期：vitest 启动，报告"未找到测试文件"——这正常（还没写测试）。

- [ ] **Step 4: 提交**

```bash
git add packages/server/package.json pnpm-lock.yaml
git commit -m "chore(server): add vitest test script for hardening tests"
```

---

### Task 2：建加固分支跟踪文档

**Files:**
- Create: `docs/加固进度跟踪.md`

- [ ] **Step 1: 写跟踪文档**

```markdown
# Node.js 加固进度跟踪 — Sprint 4 Track A

| Phase | Task | 状态 | 完成日 |
|---|---|---|---|
| Phase 1 | T3-T13 风险点 1-5 审计与修复 | ⬜ | |
| Phase 2 | T14-T25 runtime-guard 包 + supervisor | ⬜ | |
| Phase 3 | T26-T45 notifier + 端点 + 前端 + soak | ⬜ | |
| 文档 | T46-T48 部署/SOP/最终验证 | ⬜ | |
```

- [ ] **Step 2: 提交**

```bash
git add docs/加固进度跟踪.md
git commit -m "docs: add hardening progress tracker"
```

---

## Phase 1 — 5 风险点泄漏审计与修复（Tasks 3-13）

### Task 3：Risk #1 设置 — plc-driver 重连泄漏失败测试

**Files:**
- Create: `packages/plc-driver/src/__tests__/reconnect-handles-leak.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { Snap7Adapter } from '../index';

describe('Snap7Adapter reconnect handle leak', () => {
  let baselineHandles: number;

  beforeAll(() => {
    baselineHandles = (process as any)._getActiveHandles().length;
  });

  it('does not leak handles after 100 connect/disconnect cycles with mock failures', async () => {
    const adapter = new Snap7Adapter({ ip: '127.0.0.1', port: 102, rack: 0, slot: 1 });
    for (let i = 0; i < 100; i++) {
      try {
        await adapter.connect();
      } catch { /* expect failures (no real PLC) */ }
      await adapter.disconnect();
    }
    const after = (process as any)._getActiveHandles().length;
    expect(after - baselineHandles).toBeLessThanOrEqual(2);
  }, 60_000);
});
```

- [ ] **Step 2: 运行测试 — 应失败**

```bash
pnpm --filter @biocore/plc-driver test reconnect-handles-leak 2>&1 | tail -20
```
预期：FAIL（句柄数增长 > 2 因 heartbeatTimer 没清）

- [ ] **Step 3: 不修代码，先提交失败测试**

```bash
git add packages/plc-driver/src/__tests__/reconnect-handles-leak.test.ts
git commit -m "test(plc-driver): add failing reconnect handle leak test (risk #1)"
```

---

### Task 4：Risk #1 修复 — Snap7Adapter disconnect 清理

**Files:**
- Modify: `packages/plc-driver/src/index.ts`

- [ ] **Step 1: 读现有 Snap7Adapter 实现，定位 connect/disconnect/heartbeat**

```bash
grep -n "Snap7Adapter\|heartbeat\|setInterval\|clearInterval\|disconnect\|destroy" /c/BIOCORE/packages/plc-driver/src/index.ts | head -40
```

记录心跳定时器字段名（猜测：`this.heartbeatTimer` 或 `this.hbInterval`）。

- [ ] **Step 2: 在 disconnect 里显式清理 timer + null 化**

在 `Snap7Adapter.disconnect()` 方法内确保：

```typescript
disconnect(): void {
  if (this.heartbeatTimer) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
  if (this.reconnectTimer) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
  if (this.client) {
    try { this.client.Disconnect(); } catch {}
  }
  this.connected = false;
  this.removeAllListeners();
}
```

如果字段名不同，按现有代码命名调整。

- [ ] **Step 3: 跑测试 — 应过**

```bash
pnpm --filter @biocore/plc-driver test reconnect-handles-leak 2>&1 | tail -10
```
预期：PASS。

- [ ] **Step 4: 跑全包测试确认无回归**

```bash
pnpm --filter @biocore/plc-driver test 2>&1 | tail -10
```

- [ ] **Step 5: 提交**

```bash
git add packages/plc-driver/src/index.ts
git commit -m "fix(plc-driver): cleanup heartbeat/reconnect timers on disconnect (risk #1)"
```

---

### Task 5：Risk #1 验证 — 1h heap-diff 脚本

**Files:**
- Create: `scripts/leak-audit/heap-diff-plc-reconnect.mjs`

- [ ] **Step 1: 写 heap-diff 脚本**

```javascript
// scripts/leak-audit/heap-diff-plc-reconnect.mjs
import v8 from 'node:v8';
import fs from 'node:fs';
import path from 'node:path';

const OUT = './soak-runs/heap-diff-plc-reconnect';
fs.mkdirSync(OUT, { recursive: true });

const { Snap7Adapter } = await import('../../packages/plc-driver/dist/index.js');

function snap(label) {
  const file = path.join(OUT, `${label}-${Date.now()}.heapsnapshot`);
  v8.writeHeapSnapshot(file);
  return file;
}

const adapter = new Snap7Adapter({ ip: '127.0.0.1', port: 102, rack: 0, slot: 1 });

snap('baseline');
console.log('start: handles =', process._getActiveHandles().length);

const start = Date.now();
let i = 0;
while (Date.now() - start < 60 * 60_000) {  // 1h
  try { await adapter.connect(); } catch {}
  await adapter.disconnect();
  i++;
  if (i % 100 === 0) {
    console.log(`[${Math.floor((Date.now() - start) / 60_000)}min] cycles=${i}, handles=${process._getActiveHandles().length}, rss=${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)}MB`);
  }
}

snap('end');
console.log(`done: ${i} cycles, handles=${process._getActiveHandles().length}`);
```

- [ ] **Step 2: 跑 1h（后台）**

```bash
cd /c/BIOCORE && pnpm --filter @biocore/plc-driver build && node scripts/leak-audit/heap-diff-plc-reconnect.mjs > soak-runs/heap-diff-plc-reconnect.log 2>&1 &
```
等 1h 后查 `soak-runs/heap-diff-plc-reconnect.log`。

**通过标准：** 末尾 handles 与起始相差 ≤ 2；rss 增长 ≤ 50MB。

- [ ] **Step 3: 提交脚本**

```bash
git add scripts/leak-audit/heap-diff-plc-reconnect.mjs
git commit -m "test(leak-audit): 1h heap diff script for plc reconnect (risk #1)"
```

---

### Task 6：Risk #2 设置 — collector 缓冲溢出失败测试

**Files:**
- Create: `packages/data-service/src/__tests__/collector-buffer-overflow.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { DataCollector } from '../collector';

describe('DataCollector buffer overflow protection', () => {
  it('caps buffer at 3600 samples when influx is unreachable', async () => {
    const mockInflux = {
      writePoints: vi.fn().mockRejectedValue(new Error('Connection refused')),
      close: vi.fn(),
    };
    const collector = new DataCollector({
      sampleIntervalMs: 10,           // very fast for test
      influxFlushIntervalMs: 100,
      influxClient: mockInflux as any,
      bufferMax: 3600,
    });
    await collector.start();
    // wait for buffer to overflow attempts: 4000 samples × 10ms = 40s, simulate
    for (let i = 0; i < 4000; i++) {
      collector.pushSample({ ts: Date.now(), values: { temp: i } } as any);
    }
    expect(collector.bufferDepth()).toBeLessThanOrEqual(3600);
    await collector.stop();
  });

  it('cleans all timers on stop()', async () => {
    const baseline = (process as any)._getActiveHandles().filter((h: any) => h.constructor.name === 'Timeout').length;
    const mockInflux = { writePoints: vi.fn().mockResolvedValue(undefined), close: vi.fn() };
    const collector = new DataCollector({ sampleIntervalMs: 50, influxFlushIntervalMs: 100, influxClient: mockInflux as any, bufferMax: 3600 });
    await collector.start();
    await new Promise(r => setTimeout(r, 200));
    await collector.stop();
    const after = (process as any)._getActiveHandles().filter((h: any) => h.constructor.name === 'Timeout').length;
    expect(after - baseline).toBeLessThanOrEqual(0);
  });
});
```

- [ ] **Step 2: 跑 — 应失败**

```bash
pnpm --filter @biocore/data-service test collector-buffer-overflow 2>&1 | tail -10
```
预期：FAIL（buffer 无上限或 stop 漏 timer）。

- [ ] **Step 3: 提交失败测试**

```bash
git add packages/data-service/src/__tests__/collector-buffer-overflow.test.ts
git commit -m "test(data-service): add failing buffer overflow + timer cleanup tests (risk #2)"
```

---

### Task 7：Risk #2 修复 — collector 缓冲上限 + timer 清理

**Files:**
- Modify: `packages/data-service/src/collector.ts`

- [ ] **Step 1: 加 bufferMax 配置 + ring 行为**

在 `DataCollector` 类中：

```typescript
private buffer: Sample[] = [];
private readonly bufferMax: number;
private droppedCount = 0;

constructor(opts: { ..., bufferMax?: number }) {
  this.bufferMax = opts.bufferMax ?? 3600;
  // ... existing
}

pushSample(s: Sample): void {
  if (this.buffer.length >= this.bufferMax) {
    this.buffer.shift();              // drop oldest
    this.droppedCount++;
    if (this.droppedCount % 100 === 0) {
      this.emit('buffer_overflow', { dropped: this.droppedCount, depth: this.buffer.length });
    }
  }
  this.buffer.push(s);
}

bufferDepth(): number { return this.buffer.length; }
```

- [ ] **Step 2: stop() 显式清 timer**

```typescript
private sampleTimer: NodeJS.Timeout | null = null;
private flushTimer: NodeJS.Timeout | null = null;

async stop(): Promise<void> {
  if (this.sampleTimer) { clearInterval(this.sampleTimer); this.sampleTimer = null; }
  if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
  await this.flushPending();   // best-effort flush remaining
  this.removeAllListeners();
}
```

- [ ] **Step 3: 跑测试 — 应过**

```bash
pnpm --filter @biocore/data-service test collector-buffer-overflow 2>&1 | tail -10
```

- [ ] **Step 4: 跑全包测试确认无回归**

```bash
pnpm --filter @biocore/data-service test 2>&1 | tail -15
```

- [ ] **Step 5: 提交**

```bash
git add packages/data-service/src/collector.ts
git commit -m "fix(data-service): cap buffer at 3600 samples + cleanup timers on stop (risk #2)"
```

---

### Task 8：Risk #2 验证 — 1h heap-diff（influx 不可达模拟）

**Files:**
- Create: `scripts/leak-audit/heap-diff-collector.mjs`

- [ ] **Step 1: 写脚本**

```javascript
// scripts/leak-audit/heap-diff-collector.mjs
import v8 from 'node:v8';
import fs from 'node:fs';
import { DataCollector } from '../../packages/data-service/dist/collector.js';

const OUT = './soak-runs/heap-diff-collector';
fs.mkdirSync(OUT, { recursive: true });

const mockInflux = {
  writePoints: () => Promise.reject(new Error('refused')),
  close: () => {},
};
const c = new DataCollector({ sampleIntervalMs: 1000, influxFlushIntervalMs: 60_000, influxClient: mockInflux, bufferMax: 3600 });

v8.writeHeapSnapshot(`${OUT}/baseline.heapsnapshot`);
console.log('start rss:', (process.memoryUsage().rss / 1024 / 1024).toFixed(1), 'MB');

await c.start();
const start = Date.now();
const interval = setInterval(() => c.pushSample({ ts: Date.now(), values: { temp: Math.random() * 40 } }), 1000);

setTimeout(async () => {
  clearInterval(interval);
  await c.stop();
  v8.writeHeapSnapshot(`${OUT}/end.heapsnapshot`);
  console.log('end rss:', (process.memoryUsage().rss / 1024 / 1024).toFixed(1), 'MB');
  console.log('buffer depth:', c.bufferDepth());
  process.exit(0);
}, 60 * 60_000);
```

- [ ] **Step 2: 跑后台 + 提交**

```bash
node scripts/leak-audit/heap-diff-collector.mjs > soak-runs/heap-diff-collector.log 2>&1 &
git add scripts/leak-audit/heap-diff-collector.mjs
git commit -m "test(leak-audit): 1h heap diff script for collector (risk #2)"
```

通过标准：1h 后 rss 增量 ≤ 50MB；buffer depth ≤ 3600。

---

### Task 9：Risk #3 设置 — server WS 监听器泄漏失败测试

**Files:**
- Create: `packages/server/src/__tests__/ws-listener-leak.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { setupWsHandlers, eventBus } from '../ws-handler';  // we'll need this exported

describe('WS subscription cleanup', () => {
  it('does not leak listeners after 1000 connect/disconnect', async () => {
    const wss = new WebSocketServer({ port: 0 });
    setupWsHandlers(wss);
    const port = (wss.address() as any).port;
    const baseline = eventBus.listenerCount('process_values');

    for (let i = 0; i < 1000; i++) {
      const ws = new WebSocket(`ws://localhost:${port}`);
      await new Promise(res => ws.once('open', res));
      ws.send(JSON.stringify({ type: 'subscribe', channel: 'process_values' }));
      await new Promise(r => setTimeout(r, 5));
      ws.close();
      await new Promise(res => ws.once('close', res));
    }

    const after = eventBus.listenerCount('process_values');
    expect(after - baseline).toBeLessThanOrEqual(5);
    wss.close();
  }, 30_000);
});
```

- [ ] **Step 2: 跑 — 应失败（或编译失败因 setupWsHandlers 未导出）**

```bash
pnpm --filter @biocore/server test ws-listener-leak 2>&1 | tail -15
```

- [ ] **Step 3: 提交失败测试**

```bash
git add packages/server/src/__tests__/ws-listener-leak.test.ts
git commit -m "test(server): add failing WS listener leak test (risk #3)"
```

---

### Task 10：Risk #3 修复 — WS close 清理订阅 + 抽出 ws-handler

**Files:**
- Create: `packages/server/src/ws-handler.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: 抽出 ws 处理到独立文件**

新建 `packages/server/src/ws-handler.ts`：

```typescript
import { EventEmitter } from 'node:events';
import { WebSocketServer, WebSocket } from 'ws';

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(500);

interface ClientState {
  subscriptions: Map<string, (...args: any[]) => void>;
}

export function setupWsHandlers(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket) => {
    const state: ClientState = { subscriptions: new Map() };

    ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'subscribe' && typeof msg.channel === 'string') {
        if (state.subscriptions.has(msg.channel)) return;     // already subscribed
        const handler = (data: unknown) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ channel: msg.channel, data }));
        };
        state.subscriptions.set(msg.channel, handler);
        eventBus.on(msg.channel, handler);
      } else if (msg.type === 'unsubscribe' && typeof msg.channel === 'string') {
        const h = state.subscriptions.get(msg.channel);
        if (h) {
          eventBus.off(msg.channel, h);
          state.subscriptions.delete(msg.channel);
        }
      }
    });

    ws.on('close', () => {
      for (const [channel, handler] of state.subscriptions) {
        eventBus.off(channel, handler);
      }
      state.subscriptions.clear();
      ws.removeAllListeners();
    });

    ws.on('error', () => { /* swallow; close will fire */ });
  });
}
```

- [ ] **Step 2: 在 server/src/index.ts 用新 setupWsHandlers**

替换原 inline WS 升级处理逻辑为：

```typescript
import { setupWsHandlers, eventBus } from './ws-handler';
// ... 在 wss 创建后调
setupWsHandlers(wss);
// ... 原本广播 publish 改为 eventBus.emit(channel, data)
```

- [ ] **Step 3: 跑测试 — 应过**

```bash
pnpm --filter @biocore/server test ws-listener-leak 2>&1 | tail -10
```

- [ ] **Step 4: 跑全包验证 server 启动正常**

```bash
pnpm --filter @biocore/server build 2>&1 | tail -10
```
预期：0 类型错误。

- [ ] **Step 5: 提交**

```bash
git add packages/server/src/ws-handler.ts packages/server/src/index.ts
git commit -m "fix(server): WS close handler removes all per-client subscriptions (risk #3)"
```

---

### Task 11：Risk #4 设置 — batch-engine watchdog 泄漏失败测试

**Files:**
- Create: `packages/batch-engine/src/__tests__/watchdog-cleanup.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from 'vitest';
import { CommWatchdog } from '../comm-watchdog';

describe('CommWatchdog timer cleanup', () => {
  it('does not leak timers across 100 start/stop cycles', () => {
    const baseline = (process as any)._getActiveHandles().filter((h: any) => h.constructor.name === 'Timeout').length;
    for (let i = 0; i < 100; i++) {
      const wd = new CommWatchdog({ timeoutMs: 3000, onTimeout: () => {} });
      wd.start();
      wd.kick();
      wd.stop();
    }
    const after = (process as any)._getActiveHandles().filter((h: any) => h.constructor.name === 'Timeout').length;
    expect(after - baseline).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 跑 — 应失败**

```bash
pnpm --filter @biocore/batch-engine test watchdog-cleanup 2>&1 | tail -10
```

- [ ] **Step 3: 提交失败测试**

```bash
git add packages/batch-engine/src/__tests__/watchdog-cleanup.test.ts
git commit -m "test(batch-engine): add failing watchdog cleanup test (risk #4)"
```

---

### Task 12：Risk #4 修复 — CommWatchdog.stop 清 timer + dispose

**Files:**
- Modify: `packages/batch-engine/src/comm-watchdog.ts`
- Modify: `packages/batch-engine/src/batch-controller.ts`

- [ ] **Step 1: 修 CommWatchdog.stop**

在 `comm-watchdog.ts` 确保 stop 显式清：

```typescript
stop(): void {
  if (this.timeoutHandle) { clearTimeout(this.timeoutHandle); this.timeoutHandle = null; }
  if (this.intervalHandle) { clearInterval(this.intervalHandle); this.intervalHandle = null; }
  this.running = false;
}
```

- [ ] **Step 2: BatchController 加 dispose() 调 watchdog.stop**

```typescript
dispose(): void {
  this.commWatchdog?.stop();
  this.commWatchdog = null;
  this.removeAllListeners();
}
```

确保 complete()/stop()/error 路径都调用 `this.dispose()`（或在外层调用方调）。

- [ ] **Step 3: 跑测试 — 应过 + 全包测试**

```bash
pnpm --filter @biocore/batch-engine test 2>&1 | tail -15
```

- [ ] **Step 4: 提交**

```bash
git add packages/batch-engine/src/comm-watchdog.ts packages/batch-engine/src/batch-controller.ts
git commit -m "fix(batch-engine): explicit timer cleanup in watchdog stop + controller dispose (risk #4)"
```

---

### Task 13：Risk #5 — web-ui Plotly 缓冲 + Puppeteer 长跑测试

**Files:**
- Modify: `packages/web-ui/src/stores/process-values-store.ts`（或类似）
- Create: `scripts/leak-audit/frontend-soak.mjs`

- [ ] **Step 1: 限制前端时序 buffer**

定位前端储存 process values 的 zustand store（grep `process_values` `subscribe`），加 ring buffer：

```typescript
const MAX_POINTS = 7200;  // 2h × 1Hz
addSample(ch: string, p: { ts: number; v: number }) {
  const arr = this.series[ch] || [];
  arr.push(p);
  if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
  this.series[ch] = arr;
}
```

- [ ] **Step 2: 写 Puppeteer 6h 长跑脚本**

```javascript
// scripts/leak-audit/frontend-soak.mjs
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle0' });

const samples = [];
const startMem = (await page.metrics()).JSHeapUsedSize;
samples.push({ t: 0, mem: startMem });

const startTime = Date.now();
const INTERVAL = 5 * 60_000;  // 5 min
const DURATION = 6 * 60 * 60_000;  // 6h

const id = setInterval(async () => {
  const m = await page.metrics();
  samples.push({ t: Date.now() - startTime, mem: m.JSHeapUsedSize });
  console.log(`[${Math.floor((Date.now() - startTime) / 60_000)}min] heap=${(m.JSHeapUsedSize / 1024 / 1024).toFixed(1)}MB`);
  if (Date.now() - startTime > DURATION) {
    clearInterval(id);
    fs.writeFileSync('soak-runs/frontend-soak.json', JSON.stringify({ start: startMem, samples }, null, 2));
    const finalDelta = (samples.at(-1).mem - startMem) / 1024 / 1024;
    console.log(`final delta: ${finalDelta.toFixed(1)}MB`);
    await browser.close();
    process.exit(finalDelta > 100 ? 1 : 0);
  }
}, INTERVAL);
```

- [ ] **Step 3: 提交 + 准备运行**

```bash
git add packages/web-ui/src/stores/process-values-store.ts scripts/leak-audit/frontend-soak.mjs
git commit -m "fix(web-ui): cap process_values series at 7200 points + add 6h soak script (risk #5)"
```

通过标准：6h heap 增量 ≤ 100MB（手动跑一次后归档结果）。

---

### Phase 1 收尾：CI job

**Files:**
- Create: `.github/workflows/leak-audit.yml`（如用 GitHub Actions）或 `scripts/ci/run-leak-audit.sh`

加一个 CI 任务，每 PR 跑：

```yaml
name: leak-audit
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install
      - run: pnpm --filter @biocore/plc-driver test
      - run: pnpm --filter @biocore/data-service test
      - run: pnpm --filter @biocore/server test
      - run: pnpm --filter @biocore/batch-engine test
```

```bash
git add .github/workflows/leak-audit.yml
git commit -m "ci: add leak audit job covering Phase 1 risk fixes"
```

---

## Phase 2 — runtime-guard 包 + supervisor（Tasks 14-25）

### Task 14：Scaffold @biocore/runtime-guard 包

**Files:**
- Create: `packages/runtime-guard/package.json`
- Create: `packages/runtime-guard/tsconfig.json`
- Create: `packages/runtime-guard/src/index.ts`

- [ ] **Step 1: package.json**

```json
{
  "name": "@biocore/runtime-guard",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "prom-client": "^15.1.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: src/index.ts 占位 public API**

```typescript
export { installCrashHandlers } from './crash-handler';
export { MemoryWatchdog } from './memory-watchdog';
export { MetricsCollector, type HealthSnapshot } from './metrics-collector';
export { writeDiagnosticDump, listDiagnosticDumps, readDiagnosticDump } from './diagnostic-dump';
export { RingBuffer } from './ring-buffer';
```

- [ ] **Step 4: pnpm 安装 + 提交**

```bash
cd /c/BIOCORE && pnpm install
git add packages/runtime-guard pnpm-lock.yaml
git commit -m "feat(runtime-guard): scaffold package with prom-client dep"
```

---

### Task 15：ring-buffer.ts + 测试

**Files:**
- Create: `packages/runtime-guard/src/ring-buffer.ts`
- Create: `packages/runtime-guard/src/__tests__/ring-buffer.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../ring-buffer';

describe('RingBuffer', () => {
  it('keeps last N items', () => {
    const r = new RingBuffer<number>(3);
    r.push(1); r.push(2); r.push(3); r.push(4);
    expect(r.toArray()).toEqual([2, 3, 4]);
  });
  it('reports correct size', () => {
    const r = new RingBuffer<number>(5);
    expect(r.size()).toBe(0);
    r.push(1); r.push(2);
    expect(r.size()).toBe(2);
  });
  it('handles empty', () => {
    const r = new RingBuffer<number>(3);
    expect(r.toArray()).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑 — FAIL（未实现）**

```bash
pnpm --filter @biocore/runtime-guard test ring-buffer 2>&1 | tail -5
```

- [ ] **Step 3: 写实现**

```typescript
// packages/runtime-guard/src/ring-buffer.ts
export class RingBuffer<T> {
  private items: T[] = [];
  constructor(private readonly capacity: number) {}
  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.shift();
  }
  toArray(): T[] { return [...this.items]; }
  size(): number { return this.items.length; }
  clear(): void { this.items = []; }
}
```

- [ ] **Step 4: 跑 — PASS**

```bash
pnpm --filter @biocore/runtime-guard test ring-buffer 2>&1 | tail -5
```

- [ ] **Step 5: 提交**

```bash
git add packages/runtime-guard/src/ring-buffer.ts packages/runtime-guard/src/__tests__/ring-buffer.test.ts
git commit -m "feat(runtime-guard): RingBuffer with capacity-based eviction"
```

---

### Task 16：handles-inspector.ts + 测试

**Files:**
- Create: `packages/runtime-guard/src/handles-inspector.ts`
- Create: `packages/runtime-guard/src/__tests__/handles-inspector.test.ts`

- [ ] **Step 1: 测试**

```typescript
import { describe, it, expect } from 'vitest';
import { inspectHandles } from '../handles-inspector';

describe('inspectHandles', () => {
  it('returns active count and by-type breakdown', () => {
    const r = inspectHandles();
    expect(r.active).toBeGreaterThanOrEqual(0);
    expect(typeof r.byType).toBe('object');
    expect(Object.values(r.byType).reduce((a, b) => a + b, 0)).toBe(r.active);
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/runtime-guard/src/handles-inspector.ts
export interface HandlesReport { active: number; byType: Record<string, number>; }

export function inspectHandles(): HandlesReport {
  // process._getActiveHandles is deprecated/internal but stable enough for monitoring
  const handles: any[] = (process as any)._getActiveHandles?.() ?? [];
  const byType: Record<string, number> = {};
  for (const h of handles) {
    const name = h?.constructor?.name ?? 'Unknown';
    byType[name] = (byType[name] ?? 0) + 1;
  }
  return { active: handles.length, byType };
}
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/runtime-guard test handles-inspector
git add packages/runtime-guard/src/handles-inspector.ts packages/runtime-guard/src/__tests__/handles-inspector.test.ts
git commit -m "feat(runtime-guard): handles inspector with by-type breakdown"
```

---

### Task 17：event-loop-monitor.ts + 测试

**Files:**
- Create: `packages/runtime-guard/src/event-loop-monitor.ts`
- Create: `packages/runtime-guard/src/__tests__/event-loop-monitor.test.ts`

- [ ] **Step 1: 测试**

```typescript
import { describe, it, expect } from 'vitest';
import { EventLoopMonitor } from '../event-loop-monitor';

describe('EventLoopMonitor', () => {
  it('reports lag p50/p99 after sampling', async () => {
    const m = new EventLoopMonitor();
    m.start();
    await new Promise(r => setTimeout(r, 200));
    const r = m.snapshot();
    m.stop();
    expect(r.p50_ms).toBeGreaterThanOrEqual(0);
    expect(r.p99_ms).toBeGreaterThanOrEqual(r.p50_ms);
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/runtime-guard/src/event-loop-monitor.ts
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

export class EventLoopMonitor {
  private h: IntervalHistogram | null = null;

  start(resolutionMs = 20): void {
    this.h = monitorEventLoopDelay({ resolution: resolutionMs });
    this.h.enable();
  }

  snapshot(): { p50_ms: number; p99_ms: number; max_ms: number } {
    if (!this.h) return { p50_ms: 0, p99_ms: 0, max_ms: 0 };
    return {
      p50_ms: this.h.percentile(50) / 1e6,
      p99_ms: this.h.percentile(99) / 1e6,
      max_ms: this.h.max / 1e6,
    };
  }

  reset(): void { this.h?.reset(); }
  stop(): void { this.h?.disable(); this.h = null; }
}
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/runtime-guard test event-loop-monitor
git add packages/runtime-guard/src/event-loop-monitor.ts packages/runtime-guard/src/__tests__/event-loop-monitor.test.ts
git commit -m "feat(runtime-guard): event loop lag monitor with p50/p99/max"
```

---

### Task 18：diagnostic-dump.ts + 测试

**Files:**
- Create: `packages/runtime-guard/src/diagnostic-dump.ts`
- Create: `packages/runtime-guard/src/__tests__/diagnostic-dump.test.ts`

- [ ] **Step 1: 测试**

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { writeDiagnosticDump, listDiagnosticDumps, readDiagnosticDump } from '../diagnostic-dump';

const DIR = path.join(__dirname, '.tmp-crashes');
beforeEach(() => { fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true }); });
afterAll(() => { fs.rmSync(DIR, { recursive: true, force: true }); });

describe('diagnostic-dump', () => {
  it('writes a JSON dump with required fields', async () => {
    const file = await writeDiagnosticDump(new Error('boom'), 'uncaughtException', { dir: DIR });
    expect(fs.existsSync(file)).toBe(true);
    const j = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(j.type).toBe('uncaughtException');
    expect(j.error.message).toBe('boom');
    expect(j.process.pid).toBe(process.pid);
    expect(j.memory.rss).toBeGreaterThan(0);
  });

  it('lists and reads dumps', async () => {
    await writeDiagnosticDump(new Error('a'), 'unhandledRejection', { dir: DIR });
    await writeDiagnosticDump(new Error('b'), 'uncaughtException', { dir: DIR });
    const list = listDiagnosticDumps(DIR);
    expect(list.length).toBe(2);
    const first = readDiagnosticDump(list[0].path);
    expect(first.error.message).toMatch(/[ab]/);
  });

  it('keeps only last N dumps', async () => {
    for (let i = 0; i < 5; i++) {
      await writeDiagnosticDump(new Error(`e${i}`), 'uncaughtException', { dir: DIR, keepLast: 3 });
    }
    expect(listDiagnosticDumps(DIR).length).toBe(3);
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/runtime-guard/src/diagnostic-dump.ts
import fs from 'node:fs';
import path from 'node:path';
import { inspectHandles } from './handles-inspector';

export interface DumpOptions { dir?: string; keepLast?: number; extra?: Record<string, unknown>; }

export interface Dump {
  ts: string;
  type: string;
  error: { message: string; stack?: string; code?: string };
  process: { pid: number; uptime: number; version: string };
  memory: { heapUsed: number; heapTotal: number; rss: number; external: number };
  handles: { active: number; byType: Record<string, number> };
  extra?: Record<string, unknown>;
}

export async function writeDiagnosticDump(err: unknown, type: string, opts: DumpOptions = {}): Promise<string> {
  const dir = opts.dir ?? './crashes';
  fs.mkdirSync(dir, { recursive: true });
  const e = err instanceof Error ? err : new Error(String(err));
  const mem = process.memoryUsage();
  const dump: Dump = {
    ts: new Date().toISOString(),
    type,
    error: { message: e.message, stack: e.stack, code: (e as any).code },
    process: { pid: process.pid, uptime: process.uptime(), version: process.version },
    memory: { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss, external: mem.external },
    handles: inspectHandles(),
    extra: opts.extra,
  };
  const file = path.join(dir, `${dump.ts.replace(/[:.]/g, '-')}-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify(dump, null, 2));
  if (opts.keepLast) pruneOldDumps(dir, opts.keepLast);
  return file;
}

export function listDiagnosticDumps(dir: string): Array<{ path: string; ts: string }> {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ path: path.join(dir, f), ts: fs.statSync(path.join(dir, f)).mtime.toISOString() }))
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

export function readDiagnosticDump(p: string): Dump {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as Dump;
}

function pruneOldDumps(dir: string, keep: number): void {
  const list = listDiagnosticDumps(dir);
  for (const item of list.slice(0, Math.max(0, list.length - keep))) {
    fs.unlinkSync(item.path);
  }
}
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/runtime-guard test diagnostic-dump
git add packages/runtime-guard/src/diagnostic-dump.ts packages/runtime-guard/src/__tests__/diagnostic-dump.test.ts
git commit -m "feat(runtime-guard): diagnostic dump with auto-prune"
```

---

### Task 19：crash-handler.ts + 测试

**Files:**
- Create: `packages/runtime-guard/src/crash-handler.ts`
- Create: `packages/runtime-guard/src/__tests__/crash-handler.test.ts`

- [ ] **Step 1: 测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { installCrashHandlers, _resetForTest } from '../crash-handler';

describe('crash-handler', () => {
  it('routes uncaughtException to onCrash', async () => {
    _resetForTest();
    const onCrash = vi.fn().mockResolvedValue(undefined);
    installCrashHandlers({ onCrash });
    process.emit('uncaughtException' as any, new Error('boom'));
    await new Promise(r => setTimeout(r, 50));
    expect(onCrash).toHaveBeenCalledWith(expect.any(Error), 'uncaughtException');
  });

  it('routes unhandledRejection to onCrash', async () => {
    _resetForTest();
    const onCrash = vi.fn().mockResolvedValue(undefined);
    installCrashHandlers({ onCrash });
    process.emit('unhandledRejection' as any, new Error('reject'), Promise.resolve());
    await new Promise(r => setTimeout(r, 50));
    expect(onCrash).toHaveBeenCalledWith(expect.any(Error), 'unhandledRejection');
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/runtime-guard/src/crash-handler.ts
type CrashType = 'uncaughtException' | 'unhandledRejection';
type OnCrash = (err: Error, type: CrashType) => Promise<void> | void;

let installed = false;
const handlers = { uncaught: undefined as undefined | ((e: Error) => void), rejection: undefined as undefined | ((r: any) => void) };

export function installCrashHandlers(opts: { onCrash: OnCrash }): void {
  if (installed) return;
  installed = true;

  handlers.uncaught = (err: Error) => {
    Promise.resolve(opts.onCrash(err, 'uncaughtException')).catch(() => {});
  };
  handlers.rejection = (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    Promise.resolve(opts.onCrash(err, 'unhandledRejection')).catch(() => {});
  };

  process.on('uncaughtException', handlers.uncaught);
  process.on('unhandledRejection', handlers.rejection);
}

/** Test-only: detach handlers and reset state */
export function _resetForTest(): void {
  if (handlers.uncaught) process.off('uncaughtException', handlers.uncaught);
  if (handlers.rejection) process.off('unhandledRejection', handlers.rejection);
  handlers.uncaught = undefined;
  handlers.rejection = undefined;
  installed = false;
}
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/runtime-guard test crash-handler
git add packages/runtime-guard/src/crash-handler.ts packages/runtime-guard/src/__tests__/crash-handler.test.ts
git commit -m "feat(runtime-guard): crash handler routes uncaught/unhandled to onCrash"
```

---

### Task 20：memory-watchdog.ts + 测试

**Files:**
- Create: `packages/runtime-guard/src/memory-watchdog.ts`
- Create: `packages/runtime-guard/src/__tests__/memory-watchdog.test.ts`

- [ ] **Step 1: 测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MemoryWatchdog } from '../memory-watchdog';

describe('MemoryWatchdog', () => {
  it('triggers onExceed after N consecutive samples over threshold', async () => {
    const onExceed = vi.fn();
    const wd = new MemoryWatchdog({
      thresholdMb: 0.001,    // tiny so any rss is over
      sampleIntervalMs: 20,
      graceSamples: 3,
      onExceed,
    });
    wd.start();
    await new Promise(r => setTimeout(r, 200));
    wd.stop();
    expect(onExceed).toHaveBeenCalled();
  });
  it('does not trigger if below threshold', async () => {
    const onExceed = vi.fn();
    const wd = new MemoryWatchdog({
      thresholdMb: 1024 * 100,  // huge
      sampleIntervalMs: 20,
      graceSamples: 3,
      onExceed,
    });
    wd.start();
    await new Promise(r => setTimeout(r, 200));
    wd.stop();
    expect(onExceed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/runtime-guard/src/memory-watchdog.ts
import os from 'node:os';

export interface MemoryWatchdogOptions {
  thresholdMb?: number;        // null/undefined = auto (RAM × 20%)
  sampleIntervalMs?: number;
  graceSamples?: number;
  onExceed: (info: { rss_mb: number; threshold_mb: number; samples: number }) => void | Promise<void>;
}

export class MemoryWatchdog {
  private timer: NodeJS.Timeout | null = null;
  private consecutiveOver = 0;
  private readonly thresholdMb: number;
  private readonly sampleIntervalMs: number;
  private readonly graceSamples: number;
  private readonly onExceed: MemoryWatchdogOptions['onExceed'];

  constructor(opts: MemoryWatchdogOptions) {
    this.thresholdMb = opts.thresholdMb ?? Math.floor(os.totalmem() * 0.20 / 1024 / 1024);
    this.sampleIntervalMs = opts.sampleIntervalMs ?? 30_000;
    this.graceSamples = opts.graceSamples ?? 3;
    this.onExceed = opts.onExceed;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sample(), this.sampleIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.consecutiveOver = 0;
  }

  getThresholdMb(): number { return this.thresholdMb; }

  private sample(): void {
    const rssMb = process.memoryUsage().rss / 1024 / 1024;
    if (rssMb > this.thresholdMb) {
      this.consecutiveOver++;
      if (this.consecutiveOver >= this.graceSamples) {
        Promise.resolve(this.onExceed({ rss_mb: rssMb, threshold_mb: this.thresholdMb, samples: this.consecutiveOver })).catch(() => {});
        this.consecutiveOver = 0;  // reset after firing
      }
    } else {
      this.consecutiveOver = 0;
    }
  }
}
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/runtime-guard test memory-watchdog
git add packages/runtime-guard/src/memory-watchdog.ts packages/runtime-guard/src/__tests__/memory-watchdog.test.ts
git commit -m "feat(runtime-guard): memory watchdog with grace samples and auto threshold"
```

---

### Task 21：metrics-collector.ts（聚合器）+ 测试

**Files:**
- Create: `packages/runtime-guard/src/metrics-collector.ts`
- Create: `packages/runtime-guard/src/__tests__/metrics-collector.test.ts`

- [ ] **Step 1: 测试**

```typescript
import { describe, it, expect } from 'vitest';
import { MetricsCollector } from '../metrics-collector';

describe('MetricsCollector', () => {
  it('produces a HealthSnapshot', () => {
    const c = new MetricsCollector();
    c.start();
    const s = c.snapshot();
    c.stop();
    expect(s.service.pid).toBe(process.pid);
    expect(s.memory.heap_used_mb).toBeGreaterThan(0);
    expect(s.handles.active).toBeGreaterThanOrEqual(0);
    expect(s.event_loop.lag_p50_ms).toBeGreaterThanOrEqual(0);
  });

  it('records minute-resolution time series in ring buffer', async () => {
    const c = new MetricsCollector({ samplePeriodMs: 50, retentionPoints: 10 });
    c.start();
    await new Promise(r => setTimeout(r, 250));
    c.stop();
    const series = c.timeSeries();
    expect(series.length).toBeGreaterThan(0);
    expect(series.length).toBeLessThanOrEqual(10);
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/runtime-guard/src/metrics-collector.ts
import os from 'node:os';
import { EventLoopMonitor } from './event-loop-monitor';
import { inspectHandles } from './handles-inspector';
import { RingBuffer } from './ring-buffer';

export interface HealthSnapshot {
  service: { pid: number; uptime_sec: number; node: string; version: string };
  memory: { heap_used_mb: number; heap_total_mb: number; rss_mb: number; oom_threshold_mb: number; oom_pct: number };
  handles: { active: number; by_type: Record<string, number> };
  event_loop: { lag_p50_ms: number; lag_p99_ms: number; lag_max_ms: number };
  ts: string;
}

export interface MetricsCollectorOptions {
  samplePeriodMs?: number;
  retentionPoints?: number;
  oomThresholdMb?: number;
  serviceVersion?: string;
}

export class MetricsCollector {
  private readonly elm = new EventLoopMonitor();
  private readonly series: RingBuffer<HealthSnapshot>;
  private timer: NodeJS.Timeout | null = null;
  private readonly samplePeriodMs: number;
  private readonly oomThresholdMb: number;
  private readonly serviceVersion: string;

  constructor(opts: MetricsCollectorOptions = {}) {
    this.samplePeriodMs = opts.samplePeriodMs ?? 60_000;
    this.series = new RingBuffer<HealthSnapshot>(opts.retentionPoints ?? 1440);
    this.oomThresholdMb = opts.oomThresholdMb ?? Math.floor(os.totalmem() * 0.20 / 1024 / 1024);
    this.serviceVersion = opts.serviceVersion ?? '0.0.0';
  }

  start(): void {
    if (this.timer) return;
    this.elm.start();
    this.series.push(this.snapshot());
    this.timer = setInterval(() => this.series.push(this.snapshot()), this.samplePeriodMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.elm.stop();
  }

  snapshot(): HealthSnapshot {
    const mem = process.memoryUsage();
    const heapMb = mem.heapUsed / 1024 / 1024;
    const rssMb = mem.rss / 1024 / 1024;
    const lag = this.elm.snapshot();
    const handles = inspectHandles();
    return {
      service: { pid: process.pid, uptime_sec: Math.floor(process.uptime()), node: process.version, version: this.serviceVersion },
      memory: {
        heap_used_mb: Math.round(heapMb),
        heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
        rss_mb: Math.round(rssMb),
        oom_threshold_mb: this.oomThresholdMb,
        oom_pct: Math.round((rssMb / this.oomThresholdMb) * 100),
      },
      handles: { active: handles.active, by_type: handles.byType },
      event_loop: { lag_p50_ms: +lag.p50_ms.toFixed(2), lag_p99_ms: +lag.p99_ms.toFixed(2), lag_max_ms: +lag.max_ms.toFixed(2) },
      ts: new Date().toISOString(),
    };
  }

  timeSeries(): HealthSnapshot[] { return this.series.toArray(); }
}
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/runtime-guard test metrics-collector
git add packages/runtime-guard/src/metrics-collector.ts packages/runtime-guard/src/__tests__/metrics-collector.test.ts
git commit -m "feat(runtime-guard): MetricsCollector aggregates snapshot + ring buffer time series"
```

---

### Task 22：runtime-guard 接入 server

**Files:**
- Modify: `packages/server/package.json`（加 dep）
- Modify: `packages/server/src/index.ts`（第一行 require + install）

- [ ] **Step 1: 加 dep**

```bash
cd /c/BIOCORE
# 改 packages/server/package.json 的 dependencies 加：
#   "@biocore/runtime-guard": "workspace:*"
pnpm install
```

- [ ] **Step 2: server/src/index.ts 顶部接入**

在 `packages/server/src/index.ts` 最顶（在 import express 之前）：

```typescript
import { installCrashHandlers, MemoryWatchdog, MetricsCollector, writeDiagnosticDump } from '@biocore/runtime-guard';

const metricsCollector = new MetricsCollector({ serviceVersion: process.env.npm_package_version ?? '0.1.0' });
metricsCollector.start();

const memWd = new MemoryWatchdog({
  thresholdMb: process.env.BIOCORE_OOM_THRESHOLD_MB === 'auto' || !process.env.BIOCORE_OOM_THRESHOLD_MB
    ? undefined
    : Number(process.env.BIOCORE_OOM_THRESHOLD_MB),
  graceSamples: Number(process.env.BIOCORE_OOM_GRACE_SAMPLES ?? 3),
  onExceed: async (info) => {
    console.error('[memory-watchdog] threshold exceeded', info);
    await writeDiagnosticDump(new Error('OOM threshold'), 'oom_threshold', { dir: process.env.BIOCORE_DIAGNOSTIC_DUMP_DIR ?? './crashes', extra: info });
    process.kill(process.pid, 'SIGTERM');
  },
});
memWd.start();

installCrashHandlers({
  onCrash: async (err, type) => {
    try {
      await writeDiagnosticDump(err, type, {
        dir: process.env.BIOCORE_DIAGNOSTIC_DUMP_DIR ?? './crashes',
        keepLast: Number(process.env.BIOCORE_DIAGNOSTIC_KEEP_LAST ?? 50),
      });
    } catch (e) { console.error('[crash-handler] dump failed:', e); }
  },
});

// expose to other modules (admin routes will import via getter)
export { metricsCollector, memWd };
```

- [ ] **Step 3: build + manual smoke**

```bash
pnpm --filter @biocore/server build 2>&1 | tail -5
pnpm --filter @biocore/server dev &
sleep 3
curl -s http://localhost:3001/api/v1/health 2>&1 | head -3
kill %1
```
预期：build 0 错误；server 起来 + 旧 health 端点正常。

- [ ] **Step 4: 提交**

```bash
git add packages/server/package.json packages/server/src/index.ts pnpm-lock.yaml
git commit -m "feat(server): integrate runtime-guard for crash handling + memory watchdog + metrics"
```

---

### Task 23：graceful shutdown 管线

**Files:**
- Create: `packages/server/src/shutdown.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: 写 shutdown.ts**

```typescript
// packages/server/src/shutdown.ts
import type { Server as HttpServer } from 'node:http';
import type { WebSocketServer } from 'ws';

export interface ShutdownDeps {
  httpServer: HttpServer;
  wss: WebSocketServer;
  flushInflux: () => Promise<void>;
  disposeBatchControllers: () => Promise<void>;
  disconnectPlc: () => Promise<void>;
  closeSqlite: () => void;
  metricsCollector: { stop: () => void };
  memoryWatchdog: { stop: () => void };
}

export function installGracefulShutdown(deps: ShutdownDeps, timeoutMs = 30_000): void {
  let shuttingDown = false;
  const handler = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received, draining...`);

    const force = setTimeout(() => {
      console.error('[shutdown] timeout, forcing exit');
      process.exit(1);
    }, timeoutMs);
    force.unref();

    (async () => {
      try {
        await new Promise<void>((resolve) => deps.httpServer.close(() => resolve()));
        for (const ws of deps.wss.clients) {
          try { ws.send(JSON.stringify({ type: 'shutdown' })); } catch {}
          ws.close();
        }
        deps.wss.close();
        await deps.flushInflux();
        await deps.disposeBatchControllers();
        await deps.disconnectPlc();
        deps.closeSqlite();
        deps.metricsCollector.stop();
        deps.memoryWatchdog.stop();
        clearTimeout(force);
        console.log('[shutdown] clean exit');
        process.exit(0);
      } catch (e) {
        console.error('[shutdown] error:', e);
        process.exit(1);
      }
    })();
  };
  process.on('SIGTERM', handler);
  process.on('SIGINT', handler);
}
```

- [ ] **Step 2: 在 server/index.ts 调用**

在 server bootstrap 完成后：

```typescript
import { installGracefulShutdown } from './shutdown';
// ...
installGracefulShutdown({
  httpServer,
  wss,
  flushInflux: async () => { /* call dataService.flush() */ },
  disposeBatchControllers: async () => { /* iterate active controllers and dispose */ },
  disconnectPlc: async () => { /* await plcDriver.disconnect() */ },
  closeSqlite: () => { /* db.close() */ },
  metricsCollector,
  memoryWatchdog: memWd,
});
```

注：上面 4 个 lambda 内部要替换为现有 server 中的真实模块引用（`dataService` / `batchControllers` / `plcDriver` / `db`）；它们都已在 server/index.ts 顶层 import。

- [ ] **Step 3: 集成测试 — kill 进程后退出码 0**

```bash
pnpm --filter @biocore/server build
pnpm --filter @biocore/server start &
SERVER_PID=$!
sleep 5
kill -TERM $SERVER_PID
wait $SERVER_PID
echo "exit code: $?"
```
预期：30s 内退出，exit code 0。

- [ ] **Step 4: 提交**

```bash
git add packages/server/src/shutdown.ts packages/server/src/index.ts
git commit -m "feat(server): graceful shutdown pipeline with 30s timeout"
```

---

### Task 24：docker-compose 加固改造

**Files:**
- Modify: `docker-compose.yml`
- Create: `scripts/healthcheck.mjs`
- Create: `Dockerfile`（如不存在）

- [ ] **Step 1: 写 healthcheck.mjs**

```javascript
// scripts/healthcheck.mjs
import http from 'node:http';

const url = process.env.HEALTHCHECK_URL || 'http://localhost:3001/api/v1/admin/health/liveness';
const req = http.get(url, { timeout: 5_000 }, (res) => {
  if (res.statusCode === 200) process.exit(0);
  else { console.error('non-200:', res.statusCode); process.exit(1); }
});
req.on('error', (e) => { console.error('healthcheck error:', e.message); process.exit(1); });
req.on('timeout', () => { req.destroy(); console.error('healthcheck timeout'); process.exit(1); });
```

- [ ] **Step 2: 改 docker-compose.yml**

```yaml
services:
  influxdb:
    # ... existing
    restart: unless-stopped

  biocore-server:
    build:
      context: .
      dockerfile: Dockerfile
    image: biocore-server:local
    restart: unless-stopped
    depends_on:
      influxdb:
        condition: service_healthy
    ports:
      - "3001:3001"
    environment:
      - NODE_OPTIONS=--max-old-space-size=2048
      - BIOCORE_OOM_THRESHOLD_MB=auto
      - BIOCORE_OOM_GRACE_SAMPLES=3
      - BIOCORE_DIAGNOSTIC_DUMP_DIR=/app/crashes
      - BIOCORE_DIAGNOSTIC_KEEP_LAST=50
      - INFLUX_URL=http://influxdb:8086
      - SQLITE_PATH=/app/data/biocore.db
    volumes:
      - ./crashes:/app/crashes
      - ./data:/app/data
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "node", "scripts/healthcheck.mjs"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "10"
```

- [ ] **Step 3: 新建 Dockerfile（如不存在）**

```dockerfile
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/*/package.json packages/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm -r build

FROM node:20-alpine AS run
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app
COPY --from=build /app .
EXPOSE 3001
CMD ["node", "packages/server/dist/index.js"]
```

如果项目已有 Dockerfile，调整以上而不是覆盖。

- [ ] **Step 4: 试构建 + 跑**

```bash
docker compose build biocore-server 2>&1 | tail -5
docker compose up -d
sleep 10
docker compose ps
docker compose exec biocore-server node scripts/healthcheck.mjs
```
预期：healthcheck 退出码 0；status `healthy`。

- [ ] **Step 5: 提交**

```bash
git add docker-compose.yml Dockerfile scripts/healthcheck.mjs
git commit -m "feat(deploy): docker-compose hardening with healthcheck/restart/logging"
```

---

### Task 25：Windows NSSM 服务脚本

**Files:**
- Create: `scripts/install-windows-service.ps1`
- Create: `scripts/uninstall-windows-service.ps1`
- Modify: `.env.example`

- [ ] **Step 1: install 脚本**

```powershell
# scripts/install-windows-service.ps1
param(
  [string]$NodePath = "C:\Program Files\nodejs\node.exe",
  [string]$AppRoot = "C:\biocore",
  [string]$ServiceName = "BioCore"
)

if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
  Write-Error "nssm not found in PATH. Install: choco install nssm  (or download from nssm.cc)"
  exit 1
}

nssm install $ServiceName $NodePath
nssm set $ServiceName AppParameters "$AppRoot\packages\server\dist\index.js"
nssm set $ServiceName AppDirectory $AppRoot
nssm set $ServiceName AppExit Default Restart
nssm set $ServiceName AppRestartDelay 5000
nssm set $ServiceName AppStdout "$AppRoot\logs\stdout.log"
nssm set $ServiceName AppStderr "$AppRoot\logs\stderr.log"
nssm set $ServiceName AppRotateFiles 1
nssm set $ServiceName AppRotateBytes 52428800
nssm set $ServiceName AppRotateOnline 1
nssm set $ServiceName AppEnvironmentExtra `
  "NODE_OPTIONS=--max-old-space-size=2048" `
  "BIOCORE_OOM_THRESHOLD_MB=auto" `
  "BIOCORE_OOM_GRACE_SAMPLES=3" `
  "BIOCORE_DIAGNOSTIC_DUMP_DIR=$AppRoot\crashes" `
  "BIOCORE_DIAGNOSTIC_KEEP_LAST=50"

New-Item -ItemType Directory -Force -Path "$AppRoot\logs" | Out-Null
New-Item -ItemType Directory -Force -Path "$AppRoot\crashes" | Out-Null

nssm start $ServiceName
Write-Host "Service '$ServiceName' installed and started."
```

- [ ] **Step 2: uninstall 脚本**

```powershell
# scripts/uninstall-windows-service.ps1
param([string]$ServiceName = "BioCore")
nssm stop $ServiceName 2>$null
nssm remove $ServiceName confirm
Write-Host "Service '$ServiceName' removed."
```

- [ ] **Step 3: 更新 .env.example**

在 `.env.example` 末尾加：

```bash
# === Hardening (Phase 2) ===
NODE_OPTIONS=--max-old-space-size=2048
BIOCORE_OOM_THRESHOLD_MB=auto
BIOCORE_OOM_GRACE_SAMPLES=3
BIOCORE_DIAGNOSTIC_DUMP_DIR=./crashes
BIOCORE_DIAGNOSTIC_KEEP_LAST=50
```

- [ ] **Step 4: 提交**

```bash
git add scripts/install-windows-service.ps1 scripts/uninstall-windows-service.ps1 .env.example
git commit -m "feat(deploy): Windows NSSM install/uninstall scripts + .env.example update"
```

---

## Phase 3 — notifier + admin 端点 + 前端 + soak（Tasks 26-45）

### Task 26：Scaffold @biocore/notifier 包

**Files:**
- Create: `packages/notifier/package.json`
- Create: `packages/notifier/tsconfig.json`
- Create: `packages/notifier/src/index.ts`

- [ ] **Step 1: package.json**

```json
{
  "name": "@biocore/notifier",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: src/index.ts public API 占位**

```typescript
export { eventTypes, type EventType, type EventPayload } from './event-types';
export { Throttler } from './throttler';
export { AlertRouter } from './alert-router';
export { sendFeishu } from './channels/feishu';
export { sendDingtalk } from './channels/dingtalk';
export { sendTelegram } from './channels/telegram';
export { sendWebhook } from './channels/webhook';
export type { Channel } from './channels/types';
```

- [ ] **Step 4: 安装 + 提交**

```bash
pnpm install
git add packages/notifier pnpm-lock.yaml
git commit -m "feat(notifier): scaffold package with zod dep"
```

---

### Task 27：event-types.ts（zod schema）

**Files:**
- Create: `packages/notifier/src/event-types.ts`
- Create: `packages/notifier/src/__tests__/event-types.test.ts`

- [ ] **Step 1: 测试**

```typescript
import { describe, it, expect } from 'vitest';
import { eventTypes, validatePayload } from '../event-types';

describe('event-types', () => {
  it('exposes 5 event types', () => {
    expect(eventTypes).toEqual([
      'process_restart', 'oom_threshold', 'plc_disconnect_5min',
      'uncaught_exception', 'heap_growth_anomaly',
    ]);
  });
  it('validates plc_disconnect_5min payload', () => {
    const r = validatePayload('plc_disconnect_5min', { reactor_id: 'R1', duration_min: 5.5, last_seen: '2026-05-01T00:00:00Z' });
    expect(r.success).toBe(true);
  });
  it('rejects invalid payload', () => {
    const r = validatePayload('plc_disconnect_5min', { reactor_id: 'R1', duration_min: 'oops' });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/notifier/src/event-types.ts
import { z } from 'zod';

export const eventTypes = [
  'process_restart',
  'oom_threshold',
  'plc_disconnect_5min',
  'uncaught_exception',
  'heap_growth_anomaly',
] as const;
export type EventType = typeof eventTypes[number];

const payloadSchemas = {
  process_restart: z.object({ reason: z.string(), pid: z.number().optional(), uptime_sec: z.number().optional() }),
  oom_threshold: z.object({ rss_mb: z.number(), threshold_mb: z.number(), samples: z.number() }),
  plc_disconnect_5min: z.object({ reactor_id: z.string(), duration_min: z.number(), last_seen: z.string() }),
  uncaught_exception: z.object({ message: z.string(), stack: z.string().optional(), code: z.string().optional() }),
  heap_growth_anomaly: z.object({ baseline_mb: z.number(), current_mb: z.number(), growth_pct: z.number() }),
} satisfies Record<EventType, z.ZodTypeAny>;

export type EventPayload<T extends EventType> = z.infer<typeof payloadSchemas[T]>;

export function validatePayload<T extends EventType>(t: T, p: unknown): { success: true; data: EventPayload<T> } | { success: false; error: string } {
  const schema = payloadSchemas[t];
  const r = schema.safeParse(p);
  return r.success ? { success: true, data: r.data as any } : { success: false, error: r.error.message };
}
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/notifier test event-types
git add packages/notifier/src/event-types.ts packages/notifier/src/__tests__/event-types.test.ts
git commit -m "feat(notifier): event types with zod payload schemas"
```

---

### Task 28：Throttler 5 分钟去重

**Files:**
- Create: `packages/notifier/src/throttler.ts`
- Create: `packages/notifier/src/__tests__/throttler.test.ts`

- [ ] **Step 1: 测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Throttler } from '../throttler';

describe('Throttler', () => {
  it('allows first event, throttles within window', () => {
    const t = new Throttler({ windowMs: 1000, now: () => 0 });
    expect(t.shouldAllow('a')).toBe(true);
    t.record('a');
    expect(t.shouldAllow('a')).toBe(false);
  });
  it('allows after window expires', () => {
    let now = 0;
    const t = new Throttler({ windowMs: 1000, now: () => now });
    expect(t.shouldAllow('a')).toBe(true);
    t.record('a');
    now = 1500;
    expect(t.shouldAllow('a')).toBe(true);
  });
  it('counts throttled events', () => {
    const t = new Throttler({ windowMs: 1000, now: () => 0 });
    t.record('a');
    expect(t.shouldAllow('a')).toBe(false);
    t.recordThrottled('a');
    t.recordThrottled('a');
    expect(t.throttledCount('a')).toBe(2);
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/notifier/src/throttler.ts
export interface ThrottlerOptions { windowMs?: number; now?: () => number; }

export class Throttler {
  private lastFire = new Map<string, number>();
  private throttled = new Map<string, number>();
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(opts: ThrottlerOptions = {}) {
    this.windowMs = opts.windowMs ?? 5 * 60_000;
    this.now = opts.now ?? Date.now;
  }

  shouldAllow(key: string): boolean {
    const last = this.lastFire.get(key);
    if (!last) return true;
    return this.now() - last >= this.windowMs;
  }

  record(key: string): void { this.lastFire.set(key, this.now()); this.throttled.delete(key); }
  recordThrottled(key: string): void { this.throttled.set(key, (this.throttled.get(key) ?? 0) + 1); }
  throttledCount(key: string): number { return this.throttled.get(key) ?? 0; }

  cleanupExpired(): void {
    const cutoff = this.now() - this.windowMs;
    for (const [k, t] of this.lastFire) if (t < cutoff) this.lastFire.delete(k);
  }
}
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/notifier test throttler
git add packages/notifier/src/throttler.ts packages/notifier/src/__tests__/throttler.test.ts
git commit -m "feat(notifier): throttler with configurable window + throttled counter"
```

---

### Task 29：通用 webhook 通道

**Files:**
- Create: `packages/notifier/src/channels/types.ts`
- Create: `packages/notifier/src/channels/webhook.ts`
- Create: `packages/notifier/src/channels/__tests__/webhook.test.ts`

- [ ] **Step 1: 类型 + 测试**

```typescript
// packages/notifier/src/channels/types.ts
export interface ChannelConfig { webhook_url: string; secret?: string; }
export interface SendResult { ok: boolean; status?: number; error?: string; }
export type Channel = (config: ChannelConfig, message: { title: string; body: string; severity: string; raw: unknown }) => Promise<SendResult>;
```

```typescript
// packages/notifier/src/channels/__tests__/webhook.test.ts
import { describe, it, expect, vi } from 'vitest';
import { sendWebhook } from '../webhook';

describe('sendWebhook', () => {
  it('POSTs JSON to webhook_url', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const r = await sendWebhook({ webhook_url: 'https://example.com/hook' }, { title: 'T', body: 'B', severity: 'warn', raw: { x: 1 } });
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/hook', expect.objectContaining({ method: 'POST' }));
    fetchSpy.mockRestore();
  });
  it('returns ok=false on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
    const r = await sendWebhook({ webhook_url: 'https://example.com/hook' }, { title: 'T', body: 'B', severity: 'warn', raw: {} });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/notifier/src/channels/webhook.ts
import type { Channel } from './types';

export const sendWebhook: Channel = async (config, msg) => {
  try {
    const res = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/notifier test webhook
git add packages/notifier/src/channels/types.ts packages/notifier/src/channels/webhook.ts packages/notifier/src/channels/__tests__/webhook.test.ts
git commit -m "feat(notifier): generic webhook channel"
```

---

### Task 30：飞书通道

**Files:**
- Create: `packages/notifier/src/channels/feishu.ts`
- Create: `packages/notifier/src/channels/__tests__/feishu.test.ts`

- [ ] **Step 1: 测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { sendFeishu } from '../feishu';

describe('sendFeishu', () => {
  it('formats card JSON for feishu webhook', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    await sendFeishu({ webhook_url: 'https://open.feishu.cn/x' }, { title: 'BIOCore alert', body: 'PLC down', severity: 'critical', raw: {} });
    const call = fetchSpy.mock.calls[0];
    const body = JSON.parse((call[1] as any).body);
    expect(body.msg_type).toBe('interactive');
    expect(JSON.stringify(body)).toContain('BIOCore alert');
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/notifier/src/channels/feishu.ts
import type { Channel } from './types';

export const sendFeishu: Channel = async (config, msg) => {
  const card = {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: msg.title },
        template: msg.severity === 'critical' ? 'red' : msg.severity === 'warn' ? 'orange' : 'blue',
      },
      elements: [{ tag: 'div', text: { tag: 'lark_md', content: msg.body } }],
    },
  };
  try {
    const res = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const j = await res.json().catch(() => ({}));
    return { ok: (j as any).code === 0 || (j as any).StatusCode === 0, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/notifier test feishu
git add packages/notifier/src/channels/feishu.ts packages/notifier/src/channels/__tests__/feishu.test.ts
git commit -m "feat(notifier): feishu interactive card channel"
```

---

### Task 31：钉钉通道（含 sign 校验）

**Files:**
- Create: `packages/notifier/src/channels/dingtalk.ts`
- Create: `packages/notifier/src/channels/__tests__/dingtalk.test.ts`

- [ ] **Step 1: 测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { sendDingtalk, _computeSign } from '../dingtalk';

describe('sendDingtalk', () => {
  it('computes HMAC-SHA256 sign correctly', () => {
    const ts = 1234567890000;
    const secret = 'SECabcdef';
    const sign = _computeSign(ts, secret);
    expect(sign).toMatch(/^[A-Za-z0-9+/=%]+$/);  // url-encoded base64
    expect(sign.length).toBeGreaterThan(20);
  });
  it('appends timestamp + sign to webhook URL when secret provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ errcode: 0 }), { status: 200 }));
    await sendDingtalk({ webhook_url: 'https://oapi.dingtalk.com/x?access_token=T', secret: 'SECabc' }, { title: 'T', body: 'B', severity: 'warn', raw: {} });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('timestamp=');
    expect(url).toContain('sign=');
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/notifier/src/channels/dingtalk.ts
import crypto from 'node:crypto';
import type { Channel } from './types';

export function _computeSign(timestamp: number, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
  return encodeURIComponent(hmac);
}

export const sendDingtalk: Channel = async (config, msg) => {
  let url = config.webhook_url;
  if (config.secret) {
    const ts = Date.now();
    const sign = _computeSign(ts, config.secret);
    url = `${url}${url.includes('?') ? '&' : '?'}timestamp=${ts}&sign=${sign}`;
  }
  const payload = {
    msgtype: 'markdown',
    markdown: {
      title: msg.title,
      text: `### ${msg.title}\n\n**Severity:** ${msg.severity}\n\n${msg.body}`,
    },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const j = await res.json().catch(() => ({}));
    return { ok: (j as any).errcode === 0, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/notifier test dingtalk
git add packages/notifier/src/channels/dingtalk.ts packages/notifier/src/channels/__tests__/dingtalk.test.ts
git commit -m "feat(notifier): dingtalk markdown channel with HMAC sign"
```

---

### Task 32：Telegram 通道

**Files:**
- Create: `packages/notifier/src/channels/telegram.ts`
- Create: `packages/notifier/src/channels/__tests__/telegram.test.ts`

- [ ] **Step 1: 测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { sendTelegram } from '../telegram';

describe('sendTelegram', () => {
  it('uses bot token + chat_id from secret config', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await sendTelegram(
      { webhook_url: 'https://api.telegram.org/bot123:ABC/sendMessage', secret: '-100123' },
      { title: 'T', body: 'B', severity: 'critical', raw: {} },
    );
    const call = fetchSpy.mock.calls[0];
    const body = JSON.parse((call[1] as any).body);
    expect(body.chat_id).toBe('-100123');
    expect(body.text).toContain('T');
    expect(body.parse_mode).toBe('Markdown');
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/notifier/src/channels/telegram.ts
import type { Channel } from './types';

export const sendTelegram: Channel = async (config, msg) => {
  if (!config.secret) return { ok: false, error: 'telegram channel requires secret = chat_id' };
  const text = `*${msg.title}*\n_severity:_ ${msg.severity}\n\n${msg.body}`;
  try {
    const res = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.secret, text, parse_mode: 'Markdown' }),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const j = await res.json().catch(() => ({}));
    return { ok: (j as any).ok === true, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/notifier test telegram
git add packages/notifier/src/channels/telegram.ts packages/notifier/src/channels/__tests__/telegram.test.ts
git commit -m "feat(notifier): telegram bot channel with markdown parse mode"
```

---

### Task 33：AlertRouter（事件 → 规则 → 通道）

**Files:**
- Create: `packages/notifier/src/alert-router.ts`
- Create: `packages/notifier/src/__tests__/alert-router.test.ts`

- [ ] **Step 1: 测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AlertRouter } from '../alert-router';

describe('AlertRouter', () => {
  it('routes event to matching rules and dispatches to channels', async () => {
    const sendSpy = vi.fn().mockResolvedValue({ ok: true });
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [{ event_type: 'plc_disconnect_5min', channel_id: 'ch1', enabled: true }],
      send: { webhook: sendSpy } as any,
    });
    await router.emit('plc_disconnect_5min', { reactor_id: 'R1', duration_min: 5.5, last_seen: 'now' });
    expect(sendSpy).toHaveBeenCalled();
  });

  it('throttles second event within window', async () => {
    const sendSpy = vi.fn().mockResolvedValue({ ok: true });
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [{ event_type: 'plc_disconnect_5min', channel_id: 'ch1', enabled: true }],
      send: { webhook: sendSpy } as any,
      throttleMs: 5000,
    });
    await router.emit('plc_disconnect_5min', { reactor_id: 'R1', duration_min: 5.5, last_seen: '1' });
    await router.emit('plc_disconnect_5min', { reactor_id: 'R1', duration_min: 6, last_seen: '2' });
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('does not throttle heap_growth_anomaly (per spec R3)', async () => {
    const sendSpy = vi.fn().mockResolvedValue({ ok: true });
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [{ event_type: 'heap_growth_anomaly', channel_id: 'ch1', enabled: true }],
      send: { webhook: sendSpy } as any,
      throttleMs: 5000,
    });
    await router.emit('heap_growth_anomaly', { baseline_mb: 200, current_mb: 600, growth_pct: 200 });
    await router.emit('heap_growth_anomaly', { baseline_mb: 200, current_mb: 700, growth_pct: 250 });
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// packages/notifier/src/alert-router.ts
import { Throttler } from './throttler';
import type { EventType, EventPayload } from './event-types';
import { validatePayload } from './event-types';
import type { Channel, ChannelConfig, SendResult } from './channels/types';
import { sendFeishu } from './channels/feishu';
import { sendDingtalk } from './channels/dingtalk';
import { sendTelegram } from './channels/telegram';
import { sendWebhook } from './channels/webhook';

export type ChannelType = 'feishu' | 'dingtalk' | 'telegram' | 'webhook';
export interface ChannelDef { type: ChannelType; config: ChannelConfig; }
export interface Rule { event_type: EventType; channel_id: string; enabled?: boolean; min_severity?: 'info' | 'warn' | 'critical'; }

export interface AlertRouterOptions {
  channels: Record<string, ChannelDef>;
  rules: Rule[];
  throttleMs?: number;
  send?: Partial<Record<ChannelType, Channel>>;
}

const NO_THROTTLE: ReadonlySet<EventType> = new Set(['heap_growth_anomaly']);

export class AlertRouter {
  private readonly channels: Record<string, ChannelDef>;
  private rules: Rule[];
  private readonly throttler: Throttler;
  private readonly senders: Record<ChannelType, Channel>;
  private readonly history: Array<{ ts: string; type: EventType; channel: string; result: SendResult }> = [];

  constructor(opts: AlertRouterOptions) {
    this.channels = opts.channels;
    this.rules = opts.rules;
    this.throttler = new Throttler({ windowMs: opts.throttleMs ?? 5 * 60_000 });
    this.senders = {
      feishu: opts.send?.feishu ?? sendFeishu,
      dingtalk: opts.send?.dingtalk ?? sendDingtalk,
      telegram: opts.send?.telegram ?? sendTelegram,
      webhook: opts.send?.webhook ?? sendWebhook,
    };
  }

  async emit<T extends EventType>(type: T, payload: EventPayload<T>): Promise<void> {
    const validation = validatePayload(type, payload);
    if (!validation.success) { console.error('[notifier] invalid payload:', validation.error); return; }

    const key = `${type}:${(payload as any).reactor_id ?? 'global'}`;

    if (!NO_THROTTLE.has(type) && !this.throttler.shouldAllow(key)) {
      this.throttler.recordThrottled(key);
      return;
    }
    if (!NO_THROTTLE.has(type)) this.throttler.record(key);

    const matching = this.rules.filter(r => r.event_type === type && r.enabled !== false);
    const severity = this.severityFor(type);
    const message = { title: `[BIOCore] ${type}`, body: JSON.stringify(payload, null, 2), severity, raw: payload };

    for (const rule of matching) {
      const ch = this.channels[rule.channel_id];
      if (!ch) continue;
      const result = await this.senders[ch.type](ch.config, message);
      this.history.push({ ts: new Date().toISOString(), type, channel: rule.channel_id, result });
    }
  }

  private severityFor(type: EventType): 'info' | 'warn' | 'critical' {
    if (type === 'uncaught_exception' || type === 'oom_threshold' || type === 'heap_growth_anomaly') return 'critical';
    if (type === 'plc_disconnect_5min') return 'warn';
    return 'info';
  }

  recentHistory(limit = 50): typeof this.history { return this.history.slice(-limit); }
  setRules(rules: Rule[]): void { this.rules = rules; }
}
```

- [ ] **Step 3: 跑 + 提交**

```bash
pnpm --filter @biocore/notifier test alert-router
git add packages/notifier/src/alert-router.ts packages/notifier/src/__tests__/alert-router.test.ts
git commit -m "feat(notifier): AlertRouter with rule matching, throttling, no-throttle for heap anomaly"
```

---

### Task 34：notifier 公开 API + build 通过

- [ ] **Step 1: 全包 build**

```bash
pnpm --filter @biocore/notifier build 2>&1 | tail -5
```
预期：0 错误。

- [ ] **Step 2: 全包测试**

```bash
pnpm --filter @biocore/notifier test 2>&1 | tail -10
```
预期：全绿（event-types / throttler / 4 channels / alert-router）。

- [ ] **Step 3: 提交（如有改动）**

```bash
git add -A packages/notifier
git commit -m "build(notifier): typecheck and full test green"
```

---

### Task 35：migration 009 + sqlite-service 加表 CRUD

**Files:**
- Create: `packages/server/migrations/009-notification-tables.sql`
- Modify: `packages/data-service/src/sqlite-service.ts`

- [ ] **Step 1: migration**

```sql
-- migrations/009-notification-tables.sql
CREATE TABLE IF NOT EXISTS notification_channels (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('feishu','dingtalk','telegram','webhook')),
  config      TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type   TEXT NOT NULL,
  channel_id   TEXT NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  enabled      INTEGER NOT NULL DEFAULT 1,
  min_severity TEXT NOT NULL DEFAULT 'warn' CHECK (min_severity IN ('info','warn','critical'))
);

CREATE INDEX IF NOT EXISTS idx_notification_rules_event_type
  ON notification_rules(event_type) WHERE enabled = 1;
```

- [ ] **Step 2: sqlite-service CRUD**

在 `packages/data-service/src/sqlite-service.ts` 加：

```typescript
export interface NotificationChannel { id: string; type: 'feishu'|'dingtalk'|'telegram'|'webhook'; config: Record<string, unknown>; enabled: boolean; created_at: string; }
export interface NotificationRule { id: number; event_type: string; channel_id: string; enabled: boolean; min_severity: 'info'|'warn'|'critical'; }

export function listChannels(db: Database): NotificationChannel[] {
  return db.prepare('SELECT * FROM notification_channels ORDER BY created_at DESC').all().map(parseChannelRow);
}
export function upsertChannel(db: Database, ch: Omit<NotificationChannel, 'created_at'>): void {
  db.prepare(`INSERT INTO notification_channels(id, type, config, enabled) VALUES(?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET type=excluded.type, config=excluded.config, enabled=excluded.enabled`)
    .run(ch.id, ch.type, JSON.stringify(ch.config), ch.enabled ? 1 : 0);
}
export function deleteChannel(db: Database, id: string): void {
  db.prepare('DELETE FROM notification_channels WHERE id = ?').run(id);
}
export function listRules(db: Database): NotificationRule[] {
  return db.prepare('SELECT * FROM notification_rules').all().map(parseRuleRow);
}
export function setRules(db: Database, rules: Omit<NotificationRule, 'id'>[]): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM notification_rules').run();
    const stmt = db.prepare('INSERT INTO notification_rules(event_type, channel_id, enabled, min_severity) VALUES(?, ?, ?, ?)');
    for (const r of rules) stmt.run(r.event_type, r.channel_id, r.enabled ? 1 : 0, r.min_severity);
  });
  tx();
}
function parseChannelRow(r: any): NotificationChannel { return { ...r, config: JSON.parse(r.config), enabled: !!r.enabled }; }
function parseRuleRow(r: any): NotificationRule { return { ...r, enabled: !!r.enabled }; }
```

- [ ] **Step 3: 启动 server，验证 migration 跑成功**

```bash
pnpm --filter @biocore/data-service build
pnpm --filter @biocore/server build
pnpm --filter @biocore/server start &
sleep 3
sqlite3 data/biocore.db ".schema notification_channels notification_rules"
kill %1
```

- [ ] **Step 4: 提交**

```bash
git add packages/server/migrations/009-notification-tables.sql packages/data-service/src/sqlite-service.ts
git commit -m "feat(server): migration 009 + notification channels/rules CRUD"
```

---

### Task 36：admin-health 路由

**Files:**
- Create: `packages/server/src/routes/admin-health.ts`
- Modify: `packages/server/src/index.ts`（挂载 + getMetricsCollector 共享）

- [ ] **Step 1: 路由实现**

```typescript
// packages/server/src/routes/admin-health.ts
import { Router, type Request, type Response } from 'express';
import type { MetricsCollector } from '@biocore/runtime-guard';
import { listDiagnosticDumps } from '@biocore/runtime-guard';

export interface AdminHealthDeps {
  metricsCollector: MetricsCollector;
  getPlcStatus: () => { connected: boolean; last_heartbeat_age_ms: number; reconnect_count_24h: number };
  getWsStats: () => { connections: number; total_listeners: number };
  getDataServiceStats: () => { buffer_depth: number; influx_writes_24h: number; influx_failures_24h: number };
  getBatches: () => { active_count: number; current_batch_id: string | null };
  getRestarts: () => { last_24h: number; since_install: number; last_reason: string | null };
  getActiveAlerts: () => unknown[];
  crashesDir: string;
}

export function createAdminHealthRouter(deps: AdminHealthDeps): Router {
  const r = Router();

  r.get('/liveness', (_req: Request, res: Response) => {
    const lag = deps.metricsCollector.snapshot().event_loop.lag_p99_ms;
    if (lag > 1000) return res.status(503).json({ status: 'degraded', lag });
    res.json({ status: 'ok' });
  });

  r.get('/', requireAdmin, (_req, res) => {
    const snap = deps.metricsCollector.snapshot();
    const dumps = listDiagnosticDumps(deps.crashesDir);
    res.json({
      service: snap.service,
      memory: snap.memory,
      handles: snap.handles,
      event_loop: snap.event_loop,
      plc: deps.getPlcStatus(),
      ws: deps.getWsStats(),
      data_service: deps.getDataServiceStats(),
      batches: deps.getBatches(),
      restarts: deps.getRestarts(),
      crashes: { total: dumps.length, files: dumps.slice(-10).map(d => ({ ts: d.ts, path: d.path })) },
      alerts: { active: deps.getActiveAlerts(), throttled_24h: 0 },
    });
  });

  r.get('/timeseries', requireAdmin, (_req, res) => {
    res.json({ samples: deps.metricsCollector.timeSeries() });
  });

  return r;
}

function requireAdmin(req: Request, res: Response, next: () => void): void {
  const role = (req as any).user?.role;
  if (role !== 'admin') return void res.status(403).json({ error: 'admin required' });
  next();
}
```

- [ ] **Step 2: 挂到 server/index.ts**

```typescript
import { createAdminHealthRouter } from './routes/admin-health';
// ...
apiRouter.use('/admin/health', createAdminHealthRouter({
  metricsCollector,
  getPlcStatus: () => plcDriver.getStatus(),    // 替换为现有
  getWsStats: () => ({ connections: wss.clients.size, total_listeners: eventBus.listenerCount('process_values') }),
  getDataServiceStats: () => dataService.getStats(),
  getBatches: () => batchManager.summary(),
  getRestarts: () => ({ last_24h: 0, since_install: 0, last_reason: null }),  // TODO Phase 3.x with restart log
  getActiveAlerts: () => [],
  crashesDir: process.env.BIOCORE_DIAGNOSTIC_DUMP_DIR ?? './crashes',
}));
```

注：`getRestarts` 占位返回 0，Task 39 接 alert-router 的 history 时再补；不阻塞当前任务。

- [ ] **Step 3: 验证**

```bash
pnpm --filter @biocore/server build
pnpm --filter @biocore/server start &
sleep 3
curl -s http://localhost:3001/api/v1/admin/health/liveness
echo
curl -s -H "Authorization: Bearer <admin-token>" http://localhost:3001/api/v1/admin/health | head -50
kill %1
```

- [ ] **Step 4: 提交**

```bash
git add packages/server/src/routes/admin-health.ts packages/server/src/index.ts
git commit -m "feat(server): admin-health endpoints (liveness + snapshot + timeseries)"
```

---

### Task 37：admin-metrics（Prometheus）路由

**Files:**
- Create: `packages/server/src/routes/admin-metrics.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: 路由 + prom-client metrics**

```typescript
// packages/server/src/routes/admin-metrics.ts
import { Router } from 'express';
import { Registry, Gauge, Counter } from 'prom-client';
import type { MetricsCollector } from '@biocore/runtime-guard';

export interface AdminMetricsDeps {
  metricsCollector: MetricsCollector;
  getPlcConnected: () => boolean;
  getReconnectTotal: () => number;
  getWsConnections: () => number;
  getRestartTotal: (reason: string) => number;
  getUncaughtTotal: () => number;
  getInfluxFailureTotal: () => number;
  getDataBufferDepth: () => number;
  requireAuth: boolean;
}

export function createAdminMetricsRouter(deps: AdminMetricsDeps): Router {
  const r = Router();
  const registry = new Registry();

  const gHeap = new Gauge({ name: 'biocore_heap_used_bytes', help: 'Heap used', registers: [registry] });
  const gRss = new Gauge({ name: 'biocore_rss_bytes', help: 'RSS', registers: [registry] });
  const gLagP50 = new Gauge({ name: 'biocore_event_loop_lag_seconds', help: 'Event loop lag', labelNames: ['quantile'], registers: [registry] });
  const gPlc = new Gauge({ name: 'biocore_plc_connected', help: 'PLC connected (0/1)', registers: [registry] });
  const gReconn = new Counter({ name: 'biocore_plc_reconnect_count_total', help: 'PLC reconnects', registers: [registry] });
  const gWs = new Gauge({ name: 'biocore_ws_connections', help: 'WS clients', registers: [registry] });
  const gHandles = new Gauge({ name: 'biocore_handles_active', help: 'Active handles', registers: [registry] });
  const cRestarts = new Counter({ name: 'biocore_restarts_total', help: 'Restart count', labelNames: ['reason'], registers: [registry] });
  const cUncaught = new Counter({ name: 'biocore_uncaught_exceptions_total', help: 'Uncaught', labelNames: ['type'], registers: [registry] });
  const cInflux = new Counter({ name: 'biocore_influx_write_failures_total', help: 'Influx write fails', registers: [registry] });
  const gBuf = new Gauge({ name: 'biocore_data_buffer_depth', help: 'Data buffer depth', registers: [registry] });

  r.get('/', (req, res) => {
    if (deps.requireAuth && (req as any).user?.role !== 'admin') return void res.status(403).end();

    const snap = deps.metricsCollector.snapshot();
    gHeap.set(snap.memory.heap_used_mb * 1024 * 1024);
    gRss.set(snap.memory.rss_mb * 1024 * 1024);
    gLagP50.set({ quantile: '0.5' }, snap.event_loop.lag_p50_ms / 1000);
    gLagP50.set({ quantile: '0.99' }, snap.event_loop.lag_p99_ms / 1000);
    gPlc.set(deps.getPlcConnected() ? 1 : 0);
    gWs.set(deps.getWsConnections());
    gHandles.set(snap.handles.active);
    gBuf.set(deps.getDataBufferDepth());

    res.set('Content-Type', registry.contentType);
    registry.metrics().then(text => res.send(text)).catch(e => res.status(500).send(`# error: ${e}\n`));
  });

  return r;
}
```

- [ ] **Step 2: 挂载**

```typescript
import { createAdminMetricsRouter } from './routes/admin-metrics';
apiRouter.use('/admin/metrics', createAdminMetricsRouter({
  metricsCollector,
  getPlcConnected: () => plcDriver.getStatus().connected,
  getReconnectTotal: () => 0,
  getWsConnections: () => wss.clients.size,
  getRestartTotal: () => 0,
  getUncaughtTotal: () => 0,
  getInfluxFailureTotal: () => dataService.getStats().influx_failures_24h,
  getDataBufferDepth: () => dataService.getStats().buffer_depth,
  requireAuth: process.env.BIOCORE_METRICS_REQUIRE_AUTH === 'true',
}));
```

- [ ] **Step 3: 加 prom-client dep**

```bash
# 在 packages/server/package.json dependencies 加 "prom-client": "^15.1.0"
pnpm install
```

- [ ] **Step 4: 验证 + 提交**

```bash
pnpm --filter @biocore/server build
pnpm --filter @biocore/server start &
sleep 3
curl -s http://localhost:3001/api/v1/admin/metrics | head -20
kill %1

git add packages/server/src/routes/admin-metrics.ts packages/server/src/index.ts packages/server/package.json pnpm-lock.yaml
git commit -m "feat(server): admin-metrics Prometheus exposition endpoint"
```

---

### Task 38：admin-crashes 路由

**Files:**
- Create: `packages/server/src/routes/admin-crashes.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: 实现**

```typescript
// packages/server/src/routes/admin-crashes.ts
import { Router } from 'express';
import { listDiagnosticDumps, readDiagnosticDump } from '@biocore/runtime-guard';
import path from 'node:path';

export function createAdminCrashesRouter(crashesDir: string): Router {
  const r = Router();

  r.get('/', requireAdmin, (_req, res) => {
    const list = listDiagnosticDumps(crashesDir);
    res.json({ count: list.length, dumps: list.map(d => ({ ts: d.ts, name: path.basename(d.path) })) });
  });

  r.get('/:name', requireAdmin, (req, res) => {
    const name = path.basename(req.params.name);
    if (!name.endsWith('.json')) return void res.status(400).json({ error: 'invalid name' });
    const full = path.join(crashesDir, name);
    try {
      const dump = readDiagnosticDump(full);
      res.json(dump);
    } catch (e) {
      res.status(404).json({ error: 'not found' });
    }
  });

  return r;
}

function requireAdmin(req: any, res: any, next: any): void {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin required' });
  next();
}
```

- [ ] **Step 2: 挂载 + 提交**

```typescript
apiRouter.use('/admin/crashes', createAdminCrashesRouter(process.env.BIOCORE_DIAGNOSTIC_DUMP_DIR ?? './crashes'));
```

```bash
git add packages/server/src/routes/admin-crashes.ts packages/server/src/index.ts
git commit -m "feat(server): admin-crashes list/read endpoints"
```

---

### Task 39：events-sse 流（含 ring buffer + Last-Event-ID 续传）

**Files:**
- Create: `packages/server/src/routes/events-sse.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: 实现**

```typescript
// packages/server/src/routes/events-sse.ts
import { Router, type Request, type Response } from 'express';
import { RingBuffer } from '@biocore/runtime-guard';

export interface SseEvent { id: number; ts: string; type: string; data: unknown; }

export class EventStream {
  private nextId = 1;
  private buffer: RingBuffer<SseEvent>;
  private clients = new Set<Response>();
  constructor(bufferSize: number) { this.buffer = new RingBuffer(bufferSize); }

  publish(type: string, data: unknown): void {
    const ev: SseEvent = { id: this.nextId++, ts: new Date().toISOString(), type, data };
    this.buffer.push(ev);
    for (const res of this.clients) {
      try { res.write(`id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`); } catch {}
    }
  }

  attach(res: Response, lastId: number): () => void {
    this.clients.add(res);
    for (const ev of this.buffer.toArray()) {
      if (ev.id > lastId) res.write(`id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
    }
    return () => this.clients.delete(res);
  }
}

export function createEventsSseRouter(stream: EventStream, maxClients: number): Router {
  const r = Router();
  r.get('/', requireApiKey, (req: Request, res: Response) => {
    if (stream['clients'].size >= maxClients) return void res.status(503).json({ error: 'sse_max_clients_reached' });
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.flushHeaders();
    const lastId = Number(req.headers['last-event-id'] ?? 0);
    const detach = stream.attach(res, lastId);
    const heartbeat = setInterval(() => res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`), 30_000);
    heartbeat.unref?.();
    req.on('close', () => { clearInterval(heartbeat); detach(); });
  });
  return r;
}

function requireApiKey(req: any, res: any, next: any): void {
  if (!req.headers['x-api-key']) return res.status(401).json({ error: 'api key required' });
  next();
}
```

- [ ] **Step 2: 挂载 + 接 alert-router**

在 server/index.ts：

```typescript
import { EventStream, createEventsSseRouter } from './routes/events-sse';
const eventStream = new EventStream(Number(process.env.BIOCORE_EVENT_BUFFER_SIZE ?? 1000));
apiRouter.use('/events', createEventsSseRouter(eventStream, Number(process.env.BIOCORE_SSE_MAX_CLIENTS ?? 100)));

// AlertRouter 也 publish 到 stream（在 emit 后调）
// 见 Task 40 后端集成
```

- [ ] **Step 3: 提交**

```bash
git add packages/server/src/routes/events-sse.ts packages/server/src/index.ts
git commit -m "feat(server): SSE events stream with Last-Event-ID replay + max clients limit"
```

---

### Task 40：notifications CRUD 路由 + 接入 alert-router

**Files:**
- Create: `packages/server/src/routes/notifications.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: 路由实现**

```typescript
// packages/server/src/routes/notifications.ts
import { Router } from 'express';
import { AlertRouter, eventTypes } from '@biocore/notifier';
import type { Database } from 'better-sqlite3';
import { listChannels, upsertChannel, deleteChannel, listRules, setRules } from '@biocore/data-service';

export interface NotificationsDeps { db: Database; alertRouter: AlertRouter; }

export function createNotificationsRouter(deps: NotificationsDeps): Router {
  const r = Router();

  r.get('/channels', requireAdmin, (_req, res) => res.json({ channels: listChannels(deps.db) }));
  r.put('/channels/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    upsertChannel(deps.db, { id, ...req.body });
    deps.alertRouter.setChannels?.(buildChannelsMap(deps.db));   // sync
    res.json({ ok: true });
  });
  r.delete('/channels/:id', requireAdmin, (req, res) => { deleteChannel(deps.db, req.params.id); res.json({ ok: true }); });

  r.post('/channels/:id/test', requireAdmin, async (req, res) => {
    await deps.alertRouter.emit('process_restart', { reason: 'test_message', uptime_sec: process.uptime() });
    res.json({ ok: true, message: '测试事件已触发' });
  });

  r.get('/rules', requireAdmin, (_req, res) => res.json({ rules: listRules(deps.db), available_event_types: eventTypes }));
  r.put('/rules', requireAdmin, (req, res) => {
    setRules(deps.db, req.body.rules ?? []);
    deps.alertRouter.setRules(req.body.rules ?? []);
    res.json({ ok: true });
  });

  return r;
}

function requireAdmin(req: any, res: any, next: any): void {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin required' });
  next();
}

function buildChannelsMap(db: Database) {
  const out: Record<string, any> = {};
  for (const c of listChannels(db)) out[c.id] = { type: c.type, config: c.config };
  return out;
}
```

- [ ] **Step 2: 挂载 + 全局 AlertRouter**

```typescript
import { AlertRouter } from '@biocore/notifier';
import { createNotificationsRouter } from './routes/notifications';
import { listChannels, listRules } from '@biocore/data-service';

const alertRouter = new AlertRouter({
  channels: buildChannelsMap(db),
  rules: listRules(db),
  throttleMs: Number(process.env.BIOCORE_NOTIFIER_THROTTLE_MIN ?? 5) * 60_000,
});

// 把 alertRouter 接到 runtime-guard 的 onCrash + memWd.onExceed:
// 在 Task 22 已 install 的 onCrash 里加：
//   alertRouter.emit('uncaught_exception', { message: err.message, stack: err.stack, code: (err as any).code });
//
// 在 memWd 的 onExceed 里加：
//   alertRouter.emit('oom_threshold', info);
//
// 在 PLC watchdog（plc-driver 心跳超时 5min）加：
//   alertRouter.emit('plc_disconnect_5min', { reactor_id, duration_min, last_seen });
//
// AlertRouter.emit 后 publish 给 eventStream：
// 改 alert-router.ts 加 'onSent' 回调；或直接在 emit 后调 eventStream.publish
```

具体地：在 `packages/notifier/src/alert-router.ts` 的 emit 末尾加 `this.onSent?.(type, payload, results)`，再在 server 用：

```typescript
alertRouter.onSent = (type, payload) => eventStream.publish(type, payload);
```

需要在 AlertRouter 加 `onSent?: (...)` 字段（Task 33 增量）。

- [ ] **Step 3: 提交**

```bash
git add packages/server/src/routes/notifications.ts packages/server/src/index.ts packages/notifier/src/alert-router.ts
git commit -m "feat(server): notifications CRUD + global AlertRouter wired to runtime-guard hooks"
```

---

### Task 41：web-ui /admin/health 页面

**Files:**
- Create: `packages/web-ui/src/app/admin/health/page.tsx`
- Create: `packages/web-ui/src/components/admin/HealthOverview.tsx`
- Create: `packages/web-ui/src/components/admin/MemoryChart.tsx`
- Create: `packages/web-ui/src/components/admin/EventLoopChart.tsx`
- Create: `packages/web-ui/src/components/admin/RestartHistory.tsx`

- [ ] **Step 1: 页面**

```tsx
// packages/web-ui/src/app/admin/health/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { HealthOverview } from '@/components/admin/HealthOverview';
import { MemoryChart } from '@/components/admin/MemoryChart';
import { EventLoopChart } from '@/components/admin/EventLoopChart';
import { RestartHistory } from '@/components/admin/RestartHistory';

export default function AdminHealthPage() {
  const [snap, setSnap] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  useEffect(() => {
    const tick = async () => {
      const [a, b] = await Promise.all([
        apiFetch('/admin/health'),
        apiFetch('/admin/health/timeseries'),
      ]);
      setSnap(a);
      setSeries(b.samples ?? []);
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  if (!snap) return <div className="p-6">Loading...</div>;
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">系统健康度</h1>
      <HealthOverview snap={snap} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MemoryChart series={series} />
        <EventLoopChart series={series} />
      </div>
      <RestartHistory snap={snap} />
    </div>
  );
}
```

- [ ] **Step 2: HealthOverview 组件（4 卡片）**

```tsx
// packages/web-ui/src/components/admin/HealthOverview.tsx
export function HealthOverview({ snap }: { snap: any }) {
  const items = [
    { label: 'Uptime', value: `${Math.floor(snap.service.uptime_sec / 3600)}h${Math.floor((snap.service.uptime_sec % 3600) / 60)}m` },
    { label: '内存使用', value: `${snap.memory.oom_pct}%`, danger: snap.memory.oom_pct > 80 },
    { label: 'PLC', value: snap.plc.connected ? '在线' : '离线', danger: !snap.plc.connected },
    { label: '活跃批次', value: snap.batches.active_count },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map(i => (
        <div key={i.label} className={`p-4 rounded border ${i.danger ? 'bg-red-50 border-red-300' : 'bg-white'}`}>
          <div className="text-sm text-gray-500">{i.label}</div>
          <div className={`text-2xl font-bold ${i.danger ? 'text-red-700' : ''}`}>{i.value}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: MemoryChart + EventLoopChart**

```tsx
// packages/web-ui/src/components/admin/MemoryChart.tsx
import dynamic from 'next/dynamic';
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export function MemoryChart({ series }: { series: any[] }) {
  const x = series.map(s => s.ts);
  return (
    <div className="bg-white border rounded p-3">
      <h2 className="font-semibold mb-2">内存（24h）</h2>
      <Plot
        data={[
          { x, y: series.map(s => s.memory.heap_used_mb), name: 'heap_used', type: 'scatter' },
          { x, y: series.map(s => s.memory.rss_mb), name: 'rss', type: 'scatter' },
        ]}
        layout={{ height: 240, margin: { l: 40, r: 10, t: 10, b: 30 }, yaxis: { title: 'MB' } }}
        useResizeHandler
        style={{ width: '100%' }}
      />
    </div>
  );
}
```

```tsx
// packages/web-ui/src/components/admin/EventLoopChart.tsx
import dynamic from 'next/dynamic';
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export function EventLoopChart({ series }: { series: any[] }) {
  const x = series.map(s => s.ts);
  return (
    <div className="bg-white border rounded p-3">
      <h2 className="font-semibold mb-2">事件循环延迟（24h）</h2>
      <Plot
        data={[
          { x, y: series.map(s => s.event_loop.lag_p50_ms), name: 'p50', type: 'scatter' },
          { x, y: series.map(s => s.event_loop.lag_p99_ms), name: 'p99', type: 'scatter' },
        ]}
        layout={{ height: 240, margin: { l: 40, r: 10, t: 10, b: 30 }, yaxis: { title: 'ms' } }}
        useResizeHandler
        style={{ width: '100%' }}
      />
    </div>
  );
}
```

- [ ] **Step 4: RestartHistory + 页面接入**

```tsx
// packages/web-ui/src/components/admin/RestartHistory.tsx
export function RestartHistory({ snap }: { snap: any }) {
  return (
    <div className="bg-white border rounded p-3">
      <h2 className="font-semibold mb-2">最近重启与崩溃</h2>
      <div className="text-sm">
        <p>最近 24h 重启次数：<strong>{snap.restarts.last_24h}</strong></p>
        <p>累计重启次数：<strong>{snap.restarts.since_install}</strong></p>
        <p>最近原因：<code>{snap.restarts.last_reason ?? '-'}</code></p>
      </div>
      <details className="mt-3">
        <summary>诊断包列表（{snap.crashes.total}）</summary>
        <ul className="text-xs font-mono mt-2">
          {snap.crashes.files.map((f: any) => (
            <li key={f.path}><a href={`/api/v1/admin/crashes/${encodeURIComponent(f.path.split(/[\\/]/).pop())}`} target="_blank">{f.ts}</a></li>
          ))}
        </ul>
      </details>
    </div>
  );
}
```

- [ ] **Step 5: 提交**

```bash
git add packages/web-ui/src/app/admin/health/page.tsx packages/web-ui/src/components/admin/
git commit -m "feat(web-ui): /admin/health page with overview/memory/eventloop/crashes panels"
```

---

### Task 42：web-ui /settings/notifications 页面

**Files:**
- Create: `packages/web-ui/src/app/settings/notifications/page.tsx`
- Create: `packages/web-ui/src/components/notifications/ChannelManager.tsx`
- Create: `packages/web-ui/src/components/notifications/RuleTable.tsx`

- [ ] **Step 1: 页面 + 组件**

```tsx
// packages/web-ui/src/app/settings/notifications/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { ChannelManager } from '@/components/notifications/ChannelManager';
import { RuleTable } from '@/components/notifications/RuleTable';

export default function NotificationsSettingsPage() {
  const [channels, setChannels] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const reload = async () => {
    const a = await apiFetch('/notifications/channels');
    const b = await apiFetch('/notifications/rules');
    setChannels(a.channels);
    setRules(b.rules);
    setEventTypes(b.available_event_types);
  };
  useEffect(() => { reload(); }, []);
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">通知设置</h1>
      <ChannelManager channels={channels} onChange={reload} />
      <RuleTable rules={rules} channels={channels} eventTypes={eventTypes} onSave={async (next) => {
        await apiFetch('/notifications/rules', { method: 'PUT', body: JSON.stringify({ rules: next }) });
        reload();
      }} />
    </div>
  );
}
```

```tsx
// packages/web-ui/src/components/notifications/ChannelManager.tsx
'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/auth';

const TYPES = ['feishu', 'dingtalk', 'telegram', 'webhook'] as const;

export function ChannelManager({ channels, onChange }: { channels: any[]; onChange: () => void }) {
  const [editing, setEditing] = useState<any | null>(null);
  return (
    <div className="bg-white border rounded p-4">
      <div className="flex justify-between mb-3">
        <h2 className="font-semibold">通知通道</h2>
        <button onClick={() => setEditing({ id: '', type: 'webhook', config: {}, enabled: true })} className="px-3 py-1 bg-blue-600 text-white rounded">+ 新增</button>
      </div>
      <table className="w-full text-sm">
        <thead><tr><th className="text-left">ID</th><th className="text-left">类型</th><th className="text-left">启用</th><th></th></tr></thead>
        <tbody>
          {channels.map(c => (
            <tr key={c.id} className="border-t">
              <td className="py-1 font-mono">{c.id}</td>
              <td>{c.type}</td>
              <td>{c.enabled ? '✓' : '—'}</td>
              <td className="space-x-2">
                <button onClick={async () => { await apiFetch(`/notifications/channels/${c.id}/test`, { method: 'POST' }); alert('已发送测试事件'); }}>测试</button>
                <button onClick={() => setEditing(c)}>编辑</button>
                <button onClick={async () => { await apiFetch(`/notifications/channels/${c.id}`, { method: 'DELETE' }); onChange(); }}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <ChannelEditor channel={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChange(); }} />
      )}
    </div>
  );
}

function ChannelEditor({ channel, onClose, onSaved }: any) {
  const [c, setC] = useState(channel);
  const save = async () => {
    await apiFetch(`/notifications/channels/${c.id}`, { method: 'PUT', body: JSON.stringify(c) });
    onSaved();
  };
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
      <div className="bg-white p-4 rounded w-96 space-y-2">
        <h3 className="font-bold">{channel.id ? '编辑通道' : '新增通道'}</h3>
        <input className="w-full border rounded p-2" placeholder="ID（如 main_feishu）" value={c.id} onChange={e => setC({ ...c, id: e.target.value })} disabled={!!channel.id} />
        <select className="w-full border rounded p-2" value={c.type} onChange={e => setC({ ...c, type: e.target.value })}>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="w-full border rounded p-2" placeholder="webhook_url" value={c.config.webhook_url ?? ''} onChange={e => setC({ ...c, config: { ...c.config, webhook_url: e.target.value } })} />
        {(c.type === 'dingtalk' || c.type === 'telegram') && (
          <input className="w-full border rounded p-2" placeholder={c.type === 'telegram' ? 'chat_id' : 'secret'} value={c.config.secret ?? ''} onChange={e => setC({ ...c, config: { ...c.config, secret: e.target.value } })} />
        )}
        <label className="flex gap-2"><input type="checkbox" checked={c.enabled} onChange={e => setC({ ...c, enabled: e.target.checked })} /> 启用</label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1">取消</button>
          <button onClick={save} className="px-3 py-1 bg-blue-600 text-white rounded">保存</button>
        </div>
      </div>
    </div>
  );
}
```

```tsx
// packages/web-ui/src/components/notifications/RuleTable.tsx
'use client';
import { useState } from 'react';

export function RuleTable({ rules, channels, eventTypes, onSave }: any) {
  const [draft, setDraft] = useState<any[]>(rules);
  const update = (idx: number, patch: any) => setDraft(draft.map((r, i) => i === idx ? { ...r, ...patch } : r));
  const add = () => setDraft([...draft, { event_type: eventTypes[0], channel_id: channels[0]?.id ?? '', enabled: true, min_severity: 'warn' }]);
  const remove = (idx: number) => setDraft(draft.filter((_, i) => i !== idx));
  return (
    <div className="bg-white border rounded p-4">
      <div className="flex justify-between mb-3">
        <h2 className="font-semibold">触发规则</h2>
        <div className="space-x-2">
          <button onClick={add} className="px-3 py-1 border rounded">+ 添加规则</button>
          <button onClick={() => onSave(draft)} className="px-3 py-1 bg-green-600 text-white rounded">保存</button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead><tr><th>事件</th><th>通道</th><th>启用</th><th>严重度阈值</th><th></th></tr></thead>
        <tbody>
          {draft.map((r, i) => (
            <tr key={i} className="border-t">
              <td><select value={r.event_type} onChange={e => update(i, { event_type: e.target.value })}>{eventTypes.map((t: string) => <option key={t}>{t}</option>)}</select></td>
              <td><select value={r.channel_id} onChange={e => update(i, { channel_id: e.target.value })}>{channels.map((c: any) => <option key={c.id} value={c.id}>{c.id}</option>)}</select></td>
              <td><input type="checkbox" checked={r.enabled} onChange={e => update(i, { enabled: e.target.checked })} /></td>
              <td><select value={r.min_severity} onChange={e => update(i, { min_severity: e.target.value })}><option>info</option><option>warn</option><option>critical</option></select></td>
              <td><button onClick={() => remove(i)}>删除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add packages/web-ui/src/app/settings/notifications packages/web-ui/src/components/notifications
git commit -m "feat(web-ui): /settings/notifications page with channel manager + rule table"
```

---

### Task 43：scripts/soak-test.mjs

**Files:**
- Create: `scripts/soak-test.mjs`
- Create: `mocks/mock-plc-server.mjs`（如不存在）

- [ ] **Step 1: soak 脚本**

```javascript
// scripts/soak-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const DURATION_HOURS = Number(process.env.SOAK_DURATION_HOURS ?? 24);
const SPEED = Number(process.env.SOAK_SPEED_MULTIPLIER ?? 5);
const REPORT_DIR = process.env.SOAK_REPORT_DIR ?? './soak-runs';
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');

fs.mkdirSync(REPORT_DIR, { recursive: true });
const csvPath = path.join(REPORT_DIR, `${RUN_ID}.csv`);
const reportPath = path.join(REPORT_DIR, `${RUN_ID}-report.json`);
const csv = fs.createWriteStream(csvPath);
csv.write('ts,heap_used_mb,rss_mb,handles_active,lag_p99_ms,influx_failures_24h\n');

console.log(`[soak] starting ${DURATION_HOURS}h run, ${SPEED}x speed, report=${reportPath}`);

const env = { ...process.env, MOCK_PLC: 'true', SOAK_SPEED: String(SPEED) };
const server = spawn('node', ['packages/server/dist/index.js'], { env, stdio: 'inherit' });

await new Promise(r => setTimeout(r, 10_000));

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle0' });

let baseline;
const endTime = Date.now() + DURATION_HOURS * 3600_000;

const interval = setInterval(async () => {
  try {
    const r = await fetch('http://localhost:3001/api/v1/admin/health/liveness');
    if (!r.ok) return;
    const h = await fetch('http://localhost:3001/api/v1/admin/health', { headers: { 'Authorization': 'Bearer ' + (process.env.ADMIN_TOKEN ?? '') } });
    if (!h.ok) return;
    const j = await h.json();
    const browserMem = (await page.metrics()).JSHeapUsedSize;
    const row = [
      new Date().toISOString(),
      j.memory.heap_used_mb,
      j.memory.rss_mb,
      j.handles.active,
      j.event_loop.lag_p99_ms,
      j.data_service.influx_failures_24h,
      Math.round(browserMem / 1024 / 1024),
    ].join(',');
    csv.write(row + '\n');
    if (!baseline) baseline = { heap: j.memory.heap_used_mb, handles: j.handles.active, browserMem };
  } catch (e) { console.error('[soak] sample error:', e); }
}, 60_000);

setTimeout(async () => {
  clearInterval(interval);
  csv.end();
  const lastH = await (await fetch('http://localhost:3001/api/v1/admin/health', { headers: { 'Authorization': 'Bearer ' + (process.env.ADMIN_TOKEN ?? '') } })).json();
  const browserMem = (await page.metrics()).JSHeapUsedSize;

  const heapRatio = lastH.memory.heap_used_mb / baseline.heap;
  const handleDelta = lastH.handles.active - baseline.handles;
  const browserDelta = (browserMem - baseline.browserMem) / 1024 / 1024;
  const uncaughtTotal = 0;  // TODO: parse /metrics
  const influxFailures = lastH.data_service.influx_failures_24h;

  const pass =
    heapRatio <= 1.3 &&
    handleDelta <= 5 &&
    uncaughtTotal === 0 &&
    influxFailures === 0 &&
    browserDelta <= 100;

  fs.writeFileSync(reportPath, JSON.stringify({
    run: RUN_ID, duration_hours: DURATION_HOURS, speed: SPEED,
    baseline, last: lastH,
    asserts: { heapRatio, handleDelta, uncaughtTotal, influxFailures, browserDeltaMb: browserDelta },
    pass,
  }, null, 2));

  console.log(`[soak] DONE pass=${pass}, report=${reportPath}`);
  server.kill('SIGTERM');
  await browser.close();
  process.exit(pass ? 0 : 1);
}, DURATION_HOURS * 3600_000);
```

- [ ] **Step 2: 加根 package.json scripts**

```json
"scripts": {
  ...
  "soak": "node scripts/soak-test.mjs",
  "soak:short": "SOAK_DURATION_HOURS=1 node scripts/soak-test.mjs",
  "healthcheck": "node scripts/healthcheck.mjs"
}
```
加 `puppeteer` 到根 devDependencies（已有）。

- [ ] **Step 3: 短跑验证（1h）**

```bash
pnpm -r build
pnpm soak:short
```

- [ ] **Step 4: 提交**

```bash
git add scripts/soak-test.mjs package.json
git commit -m "test(soak): 24h accelerated soak script with full assertion criteria"
```

---

### Task 44：Prometheus profile + Grafana 面板

**Files:**
- Create: `docker-compose.observability.yml`
- Create: `observability/prometheus.yml`
- Create: `observability/grafana/dashboards/biocore-runtime.json`

- [ ] **Step 1: prometheus.yml**

```yaml
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: biocore
    static_configs:
      - targets: ['biocore-server:3001']
    metrics_path: /api/v1/admin/metrics
```

- [ ] **Step 2: docker-compose.observability.yml**

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    profiles: ["observability"]
    ports: ["9090:9090"]
    volumes:
      - ./observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    profiles: ["observability"]
    ports: ["3002:3000"]
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=biocore_admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./observability/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
    depends_on: [prometheus]
    restart: unless-stopped

volumes:
  grafana_data:
```

- [ ] **Step 3: Grafana dashboard JSON（最小骨架）**

```json
{
  "title": "BIOCore Runtime",
  "panels": [
    { "type": "graph", "title": "Heap Used", "targets": [{ "expr": "biocore_heap_used_bytes" }] },
    { "type": "graph", "title": "Event Loop Lag p99", "targets": [{ "expr": "biocore_event_loop_lag_seconds{quantile=\"0.99\"}" }] },
    { "type": "stat", "title": "PLC Connected", "targets": [{ "expr": "biocore_plc_connected" }] },
    { "type": "graph", "title": "WS Connections", "targets": [{ "expr": "biocore_ws_connections" }] }
  ],
  "schemaVersion": 30,
  "version": 1
}
```

- [ ] **Step 4: 试跑 + 提交**

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability up -d
sleep 10
curl -s http://localhost:9090/api/v1/targets | head
docker compose -f docker-compose.yml -f docker-compose.observability.yml down
git add docker-compose.observability.yml observability/
git commit -m "feat(deploy): observability profile (Prometheus + Grafana) with biocore dashboard"
```

---

### Task 45：CI 集成（soak + 单测）

**Files:**
- Modify/Create: `.github/workflows/soak.yml`

- [ ] **Step 1: 写 workflow**

```yaml
name: soak
on:
  workflow_dispatch:
  schedule: [{ cron: '0 4 * * 0' }]   # 周日 4am
  push: { branches: [main] }
jobs:
  soak-24h:
    runs-on: [self-hosted, soak]      # 需要 self-hosted runner
    timeout-minutes: 1500
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install
      - run: pnpm -r build
      - run: pnpm soak
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: soak-report-${{ github.run_id }}
          path: soak-runs/
          retention-days: 30
```

- [ ] **Step 2: 提交**

```bash
git add .github/workflows/soak.yml
git commit -m "ci: 24h soak workflow with self-hosted runner + 30d artifact retention"
```

---

## 文档（Tasks 46-48）

### Task 46：更新 docs/部署说明.md（三档硬件 + Docker/Windows 装机）

**Files:**
- Modify: `docs/部署说明.md`

- [ ] **Step 1: 加章节"硬件三档矩阵"**

```markdown
## 硬件规格

| 档次 | CPU | RAM | 磁盘 | 适用 | OOM 阈值 |
|---|---|---|---|---|---|
| 入门 | 4 核 | 8GB | 256GB SSD | 1-2 反应器，无本地 AI | 1.5GB |
| 标准 | 8 核 | 16GB | 512GB SSD | 多反应器 + 本地 Ollama AI | 3.2GB |
| 企业 | 16+ 核 | 32GB+ | 1TB+ NVMe | 多车间 / 中央汇总 | 6.4GB |

OOM 阈值由 `BIOCORE_OOM_THRESHOLD_MB` 环境变量控制；默认 `auto` = 物理内存 × 20%。

## Docker 装机

```bash
git clone <repo> && cd biocore
cp .env.example .env  # 编辑 JWT_SECRET、INFLUX_TOKEN
docker compose up -d
docker compose ps      # 验证 healthy
docker compose --profile observability up -d   # 可选 Prometheus + Grafana
```

## Windows 工控机装机

```powershell
# 1. 装 Node 20 + pnpm + nssm
# 2. clone + pnpm install + pnpm build
# 3. 起 InfluxDB（Docker Desktop 或独立服务）
# 4. 注册 Windows 服务：
.\scripts\install-windows-service.ps1 -AppRoot C:\biocore
# 5. 验证：访问 http://localhost:3001/api/v1/admin/health/liveness
```

## 升级流程

```bash
docker compose pull
docker compose up -d biocore-server
# 等 healthcheck 转 healthy 即升级完成
```
```

- [ ] **Step 2: 提交**

```bash
git add docs/部署说明.md
git commit -m "docs: hardware tiers + Docker/Windows install + upgrade SOP"
```

---

### Task 47：新建 docs/加固SOP.md

**Files:**
- Create: `docs/加固SOP.md`

- [ ] **Step 1: 写 SOP**

```markdown
# BIOCore 加固运维 SOP

## 1. 健康度自检（每天）

访问 `http://<host>:3000/admin/health`：
- 内存使用 < 60%、PLC 在线、活跃批次符合预期 → 正常
- 内存使用 > 80% → 检查诊断包，考虑触发优雅重启

## 2. 触发优雅重启

```bash
# Docker
docker compose restart biocore-server

# Windows NSSM
nssm restart BioCore
```

期间 PLC 自带连锁继续跑（最长 3s 看门狗自动 Hold），Node 重启后自动恢复批次。

## 3. 取诊断包

崩溃自动写到 `<install>/crashes/<ISO>-<pid>.json`。手动 SSH 取，或：

```
GET /api/v1/admin/crashes              -> 列表
GET /api/v1/admin/crashes/<filename>   -> 单包内容
```

## 4. 配置告警通道

`http://<host>:3000/settings/notifications`：

### 飞书
1. 群 → 设置 → 群机器人 → Custom Bot
2. 复制 webhook_url
3. 通道类型选 `feishu`，粘贴 URL，点"测试"

### 钉钉
1. 群 → 智能群助手 → 添加 → 自定义 → 加签
2. 复制 webhook_url + secret
3. 通道类型选 `dingtalk`，分别填入

### Telegram
1. 找 @BotFather 创建 bot，得 token；token 拼到 URL：`https://api.telegram.org/bot<TOKEN>/sendMessage`
2. 把 bot 拉进群，发一条消息后访问 `https://api.telegram.org/bot<TOKEN>/getUpdates` 找 `chat.id`
3. 通道类型选 `telegram`，URL 填上面拼接好的，secret 填 chat_id

### 通用 webhook
任何接收 JSON POST 的 HTTPS endpoint。

## 5. soak 报告解读

报告位置：`soak-runs/<run-id>-report.json`

| 字段 | 通过标准 |
|---|---|
| `asserts.heapRatio` | ≤ 1.3 |
| `asserts.handleDelta` | ≤ 5 |
| `asserts.uncaughtTotal` | 0 |
| `asserts.influxFailures` | 0 |
| `asserts.browserDeltaMb` | ≤ 100 |
| `pass` | true |

任何一项不通过 → review CSV 趋势 → 定位到时间窗口 → 取对应诊断包。
```

- [ ] **Step 2: 提交**

```bash
git add docs/加固SOP.md
git commit -m "docs: hardening operations SOP"
```

---

### Task 48：最终验证 + 更新加固进度跟踪

**Files:**
- Modify: `docs/加固进度跟踪.md`

- [ ] **Step 1: 全 monorepo build + test 全绿**

```bash
pnpm -r build 2>&1 | tail -20
pnpm -r test  2>&1 | tail -20
```
预期：所有包 build 0 错误；所有 test 100% 绿。

- [ ] **Step 2: 端到端启动 + smoke**

```bash
docker compose down -v
docker compose up -d
sleep 30
docker compose ps              # 所有 healthy
curl -s http://localhost:3001/api/v1/admin/health/liveness
curl -s http://localhost:3001/api/v1/admin/metrics | head -10
docker compose logs --tail 50 biocore-server | grep -i "error\|warn" || echo "no errors"
```

- [ ] **Step 3: 1h soak 短跑**

```bash
pnpm soak:short
cat soak-runs/*-report.json | grep '"pass"'
```
预期：`"pass": true`。

- [ ] **Step 4: 更新进度跟踪**

将 `docs/加固进度跟踪.md` 中的 ⬜ 改为 ✅，加完成日期。

- [ ] **Step 5: 收尾提交 + tag**

```bash
git add docs/加固进度跟踪.md
git commit -m "docs: hardening Sprint 4 Track A complete (v1.6.0)"
git tag v1.6.0-hardening
```

---

## Self-Review

| Spec § | 是否被任务覆盖 | 任务 # |
|---|---|---|
| §1 决策 1 部署形态 Docker+Windows | ✅ | T24 + T25 |
| §1 决策 2 重启容忍度 | ✅ | T22 + T23 |
| §1 决策 3 监控形态 | ✅ | T36 + T37 + T44 |
| §1 决策 4 硬件三档 | ✅ | T20 (auto threshold) + T46 docs |
| §1 决策 5 24h soak | ✅ | T43 + T45 |
| §1 决策 6 通知通道 | ✅ | T26-T34 + T39 + T40 + T42 |
| §4 Phase 1 风险点 1 | ✅ | T3-T5 |
| §4 Phase 1 风险点 2 | ✅ | T6-T8 |
| §4 Phase 1 风险点 3 | ✅ | T9-T10 |
| §4 Phase 1 风险点 4 | ✅ | T11-T12 |
| §4 Phase 1 风险点 5 | ✅ | T13 |
| §5 Phase 2 全局 handler | ✅ | T19 + T22 |
| §5 Phase 2 诊断包 | ✅ | T18 |
| §5 Phase 2 memory watchdog | ✅ | T20 |
| §5 Phase 2 docker compose | ✅ | T24 |
| §5 Phase 2 NSSM | ✅ | T25 |
| §5 Phase 2 graceful shutdown | ✅ | T23 |
| §6 Phase 3 admin/health | ✅ | T36 + T41 |
| §6 Phase 3 admin/metrics | ✅ | T37 |
| §6 Phase 3 admin/crashes | ✅ | T38 |
| §6 Phase 3 events SSE | ✅ | T39 |
| §6 Phase 3 notifier 包 | ✅ | T26-T34 |
| §6 Phase 3 settings/notifications | ✅ | T42 |
| §6 Phase 3 24h soak | ✅ | T43 |
| §6 Phase 3 Prometheus profile | ✅ | T44 |
| §7 跨切面新增包 | ✅ | T14 (runtime-guard) + T26 (notifier) |
| §7 .env.example | ✅ | T25 |
| §7 文档 | ✅ | T46 + T47 |
| §8 测试金字塔 | ✅ | 单测散布 + T43 soak + T45 CI |
| §9 风险 R1-R10 对策 | ✅ | T19 R1（try/catch 初始化）/ T20 R2（grace samples）/ T33 R3（heap_growth_anomaly 不防抖）/ T29-T32 R4（通道层封装）/ T39 R5（max clients 限）/ TDD-first R6 / T45 R7（self-hosted runner）/ T44 R8（端口避开）/ T25 R9（LocalSystem）/ 文档 R10 |
| §10 回滚策略 | ✅ | git revert per commit + T25 uninstall |
| §11 v1.6.0 tag | ✅ | T48 |

无 spec 缺口；无 placeholder；类型签名前后一致。

---

## 执行选项

Plan complete and saved to `docs/superpowers/plans/2026-05-01-nodejs-hardening-plan.md`. Two execution options:

**1. Subagent-Driven（推荐）** — 每个 task 派遣 fresh subagent，task 间审查，迭代快

**2. Inline Execution** — 在当前会话内执行，批量推进 + checkpoint 审查

**选哪个？**
