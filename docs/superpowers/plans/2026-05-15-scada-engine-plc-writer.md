# SCADA Engine PLC Writer 实施计划 (子项目 7/7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 闭合 SCADA write-intent 端到端路径 — operator accept 后, server engine daemon 异步把 `suggested_value` 写到真实 PLC (S7) / Modbus / MockPlc, 失败可重试 3 次, 审计每次下发。

**Architecture:** SQLite-driven 队列模式。`ai_suggestions` 表新增 `dispatch_status` 状态机字段;accept handler 将 SCADA 行标为 `pending_dispatch`;独立 `scada-write-dispatcher` daemon 每 500ms 拾取并通过 `PlcWriter` 抽象接口写下发, 成功/失败/重试都更新 SQLite 状态 + 写 audit_log + WS broadcast。

**Tech Stack:** TypeScript / Node.js 18+ / better-sqlite3 / node-snap7 (S7) / modbus-serial / vitest 1.6 + supertest / Next.js (web-ui 客户端徽章)。

**Spec:** `docs/superpowers/specs/2026-05-15-scada-engine-plc-writer-design.md`

**Branch:** `feat/scada-data-model`

---

## 文件清单

**新建:**
- `packages/server/migrations/029-scada-dispatch.sql`
- `packages/server/src/engine/scada-write-dispatcher.ts`
- `packages/server/src/engine/plc-writer.ts`
- `packages/server/src/engine/__tests__/scada-write-dispatcher.test.ts`
- `packages/server/src/engine/__tests__/plc-writer.test.ts`
- `packages/server/src/__tests__/ai-suggestions-dispatch.test.ts`
- `packages/data-service/src/__tests__/dispatch-methods.test.ts`
- `packages/web-ui/src/components/scada/suggestions/__tests__/SuggestionRow.dispatch.test.tsx`

**修改:**
- `packages/data-service/src/sqlite-service.ts` — + 5 dispatch 方法
- `packages/server/src/index.ts` — accept handler 调 `setDispatchPending`;启动调 `startScadaWriteDispatcher`
- `packages/web-ui/src/api/scada.ts` — `ScadaSuggestion` 接口加 4 dispatch 字段
- `packages/web-ui/src/components/scada/suggestions/SuggestionRow.tsx` — 渲染 dispatch_status 徽章

---

## Task 1: Migration 029 + sqlite-service 5 dispatch 方法 + 4 测试

**Files:**
- Create: `packages/server/migrations/029-scada-dispatch.sql`
- Modify: `packages/data-service/src/sqlite-service.ts`
- Create: `packages/data-service/src/__tests__/dispatch-methods.test.ts`

- [ ] **Step 1: 写 migration 029**

创建 `/Volumes/SSD/BIOCORE/packages/server/migrations/029-scada-dispatch.sql`:

```sql
-- SCADA dispatch state machine: pending_dispatch → dispatching → dispatched|failed
ALTER TABLE ai_suggestions ADD COLUMN dispatch_status TEXT;
ALTER TABLE ai_suggestions ADD COLUMN dispatch_retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_suggestions ADD COLUMN dispatched_at TEXT;
ALTER TABLE ai_suggestions ADD COLUMN dispatch_error TEXT;
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_pending_dispatch
  ON ai_suggestions(dispatch_status)
  WHERE dispatch_status IN ('pending_dispatch', 'dispatching');
```

- [ ] **Step 2: 写失败测试**

创建 `/Volumes/SSD/BIOCORE/packages/data-service/src/__tests__/dispatch-methods.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '../sqlite-service';

function makeDb(): { db: Database.Database; svc: SQLiteService } {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/029-scada-dispatch.sql'), 'utf8'));
  db.prepare(`INSERT INTO batches (batch_id, recipe_id, started_at, current_state)
              VALUES ('b1', 1, datetime('now'), 'running')`).run();
  const svc = new SQLiteService(db);
  return { db, svc };
}

describe('SQLiteService dispatch methods', () => {
  it('setDispatchPending only marks widget_button + scada rows', () => {
    const { db, svc } = makeDb();
    const sc = svc.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'F01.SP-temp', suggested_value: 38, reasoning: '{}',
    });
    const ai = svc.createSuggestion({
      batch_id: 'b1', suggestion_type: 'setpoint_adjust', source_module: 'ai_auto',
      target_param: 'F01.SP-pH', suggested_value: 7.2, reasoning: 'auto',
    });
    svc.setDispatchPending(sc);
    svc.setDispatchPending(ai);
    const scRow: any = db.prepare('SELECT dispatch_status FROM ai_suggestions WHERE id=?').get(sc);
    const aiRow: any = db.prepare('SELECT dispatch_status FROM ai_suggestions WHERE id=?').get(ai);
    expect(scRow.dispatch_status).toBe('pending_dispatch');
    expect(aiRow.dispatch_status).toBeNull();
  });

  it('claimPendingDispatches returns rows and marks them dispatching', () => {
    const { db, svc } = makeDb();
    const a = svc.createSuggestion({ batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'T1', suggested_value: 1, reasoning: '{}' });
    const b = svc.createSuggestion({ batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'T2', suggested_value: 2, reasoning: '{}' });
    svc.setDispatchPending(a);
    svc.setDispatchPending(b);

    const claimed = svc.claimPendingDispatches(10);
    expect(claimed.length).toBe(2);
    expect(claimed.map((r: any) => r.id).sort()).toEqual([a, b].sort());
    const after: any = db.prepare('SELECT dispatch_status FROM ai_suggestions WHERE id=?').get(a);
    expect(after.dispatch_status).toBe('dispatching');
    expect(svc.claimPendingDispatches(10).length).toBe(0);
  });

  it('markDispatched sets status + dispatched_at', () => {
    const { db, svc } = makeDb();
    const id = svc.createSuggestion({ batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'T1', suggested_value: 1, reasoning: '{}' });
    svc.setDispatchPending(id);
    svc.claimPendingDispatches(10);
    svc.markDispatched(id);
    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('dispatched');
    expect(row.dispatched_at).toBeTruthy();
    expect(row.dispatch_error).toBeNull();
  });

  it('markDispatchFailed/incrementDispatchRetry/rollback work as documented', () => {
    const { db, svc } = makeDb();
    const id = svc.createSuggestion({ batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'T1', suggested_value: 1, reasoning: '{}' });
    svc.setDispatchPending(id);
    svc.claimPendingDispatches(10);
    svc.incrementDispatchRetry(id);
    const r1: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(r1.dispatch_status).toBe('pending_dispatch');
    expect(r1.dispatch_retry_count).toBe(1);

    svc.markDispatchFailed(id, 'PLC timeout');
    const r2: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(r2.dispatch_status).toBe('failed');
    expect(r2.dispatch_error).toBe('PLC timeout');

    db.prepare("UPDATE ai_suggestions SET dispatch_status='dispatching' WHERE id=?").run(id);
    svc.rollbackInProgressDispatches();
    const r3: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(r3.dispatch_status).toBe('pending_dispatch');
  });
});
```

- [ ] **Step 3: 运行测试看 RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/data-service && npx vitest run src/__tests__/dispatch-methods.test.ts`
Expected: FAIL (5 方法不存在)

- [ ] **Step 4: 实现 5 方法**

打开 `/Volumes/SSD/BIOCORE/packages/data-service/src/sqlite-service.ts`,在 `acceptSuggestion` 方法之后(约 line 280)追加:

```ts
setDispatchPending(id: number): void {
  this.db.prepare(`
    UPDATE ai_suggestions SET dispatch_status='pending_dispatch'
    WHERE id=? AND suggestion_type='widget_button' AND source_module='scada'
  `).run(id);
}

claimPendingDispatches(limit: number): any[] {
  return this.db.transaction(() => {
    const rows = this.db.prepare(`
      SELECT * FROM ai_suggestions
      WHERE dispatch_status='pending_dispatch'
      ORDER BY id LIMIT ?
    `).all(limit) as any[];
    if (rows.length === 0) return [];
    const ids = rows.map((r: any) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(`UPDATE ai_suggestions SET dispatch_status='dispatching' WHERE id IN (${placeholders})`).run(...ids);
    return rows;
  })();
}

markDispatched(id: number): void {
  this.db.prepare(`
    UPDATE ai_suggestions
    SET dispatch_status='dispatched', dispatched_at=datetime('now'), dispatch_error=NULL
    WHERE id=?
  `).run(id);
}

markDispatchFailed(id: number, err: string): void {
  this.db.prepare(`UPDATE ai_suggestions SET dispatch_status='failed', dispatch_error=? WHERE id=?`).run(err, id);
}

incrementDispatchRetry(id: number): void {
  this.db.prepare(`
    UPDATE ai_suggestions
    SET dispatch_status='pending_dispatch', dispatch_retry_count=dispatch_retry_count+1
    WHERE id=?
  `).run(id);
}

rollbackInProgressDispatches(): void {
  this.db.prepare(`UPDATE ai_suggestions SET dispatch_status='pending_dispatch' WHERE dispatch_status='dispatching'`).run();
}
```

- [ ] **Step 5: rebuild dist (server tests 依赖 dist)**

Run: `cd /Volumes/SSD/BIOCORE/packages/data-service && npm run build`
Expected: 0 errors

- [ ] **Step 6: 运行测试看 GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/data-service && npx vitest run src/__tests__/dispatch-methods.test.ts`
Expected: 4/4 PASS

- [ ] **Step 7: 提交**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/server/migrations/029-scada-dispatch.sql packages/data-service/src/sqlite-service.ts packages/data-service/src/__tests__/dispatch-methods.test.ts
git commit -m "feat(data-service): dispatch state machine — 029 migration + 5 sqlite methods (4 tests)"
```

---

## Task 2: PlcWriter interface + MockPlcWriter + 1 测试

**Files:**
- Create: `packages/server/src/engine/plc-writer.ts`
- Create: `packages/server/src/engine/__tests__/plc-writer.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `/Volumes/SSD/BIOCORE/packages/server/src/engine/__tests__/plc-writer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MockPlcWriter } from '../plc-writer';

describe('MockPlcWriter', () => {
  it('writes value to in-mem store keyed by conn.id:plc_address', async () => {
    const w = new MockPlcWriter();
    const conn = { id: 'c1', protocol: 's7' } as any;
    const mapping = { plc_address: 'DB1.DBD0', data_type: 'real' } as any;
    await w.write(conn, mapping, 42.5);
    expect(w.read('c1', 'DB1.DBD0')).toBe(42.5);
  });
});
```

- [ ] **Step 2: 看 RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/engine/__tests__/plc-writer.test.ts`
Expected: FAIL (module 不存在)

- [ ] **Step 3: 实现 plc-writer.ts (Mock 部分)**

创建 `/Volumes/SSD/BIOCORE/packages/server/src/engine/plc-writer.ts`:

```ts
import type { PLCConnectionConfig, PLCVariableMapping } from '../../../plc-driver/src/types';

export interface PlcWriter {
  write(conn: PLCConnectionConfig, mapping: PLCVariableMapping, value: number): Promise<void>;
}

export class MockPlcWriter implements PlcWriter {
  private mem = new Map<string, number>();

  async write(conn: PLCConnectionConfig, mapping: PLCVariableMapping, value: number): Promise<void> {
    const key = `${conn.id}:${mapping.plc_address}`;
    this.mem.set(key, value);
  }

  read(connId: string, addr: string): number | undefined {
    return this.mem.get(`${connId}:${addr}`);
  }
}

const mockSingleton = new MockPlcWriter();
export function getMockPlcWriter(): MockPlcWriter {
  return mockSingleton;
}
```

- [ ] **Step 4: 看 GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/engine/__tests__/plc-writer.test.ts`
Expected: 1/1 PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/server/src/engine/plc-writer.ts packages/server/src/engine/__tests__/plc-writer.test.ts
git commit -m "feat(server/engine): PlcWriter interface + MockPlcWriter (1 test)"
```

---

## Task 3: S7PlcWriter (dynamic load, MOCK_PLC fallback) + 2 测试

**Files:**
- Modify: `packages/server/src/engine/plc-writer.ts`
- Modify: `packages/server/src/engine/__tests__/plc-writer.test.ts`

- [ ] **Step 1: 写 S7 测试 (mock snap7)**

追加到 `/Volumes/SSD/BIOCORE/packages/server/src/engine/__tests__/plc-writer.test.ts`:

```ts
import { S7PlcWriter } from '../plc-writer';

describe('S7PlcWriter', () => {
  it('calls WriteArea and resolves on success', async () => {
    let captured: any = {};
    const fakeClient = {
      Connected: () => true,
      ConnectTo: (_ip: string, _r: number, _s: number, cb: (e: any) => void) => cb(null),
      WriteArea: (area: number, db: number, start: number, amt: number, wl: number, buf: Buffer, cb: (err: any) => void) => {
        captured = { area, db, start, amt, wl, buf };
        cb(null);
      },
    };
    const w = new S7PlcWriter(() => fakeClient as any);
    const conn = { id: 'c1', protocol: 's7', ip: '127.0.0.1', rack: 0, slot: 1, s7_db: 1 } as any;
    const mapping = { plc_address: 'DB1.DBD0', data_type: 'real', scaling_enabled: 0 } as any;
    await w.write(conn, mapping, 42.5);
    expect(captured.amt).toBeGreaterThan(0);
  });

  it('rejects with Error when WriteArea callback receives err', async () => {
    const fakeClient = {
      Connected: () => true,
      ConnectTo: (_ip: string, _r: number, _s: number, cb: (e: any) => void) => cb(null),
      WriteArea: (_a: number, _d: number, _s: number, _am: number, _w: number, _b: Buffer, cb: (err: any) => void) => cb(5),
    };
    const w = new S7PlcWriter(() => fakeClient as any);
    const conn = { id: 'c1', protocol: 's7', ip: '127.0.0.1', rack: 0, slot: 1, s7_db: 1 } as any;
    const mapping = { plc_address: 'DB1.DBD0', data_type: 'real', scaling_enabled: 0 } as any;
    await expect(w.write(conn, mapping, 42.5)).rejects.toThrow(/S7 WriteArea/);
  });
});
```

- [ ] **Step 2: 看 RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/engine/__tests__/plc-writer.test.ts`
Expected: FAIL (S7PlcWriter undefined)

- [ ] **Step 3: 实现 S7PlcWriter**

追加到 `/Volumes/SSD/BIOCORE/packages/server/src/engine/plc-writer.ts`:

```ts
import { parseAddr } from '../../../plc-driver/src/utils';

const AREA_DB = 0x84;
const WORDLEN_BYTE = 0x02;

function encodeValue(value: number, dataType: string): Buffer {
  const dt = (dataType || '').toLowerCase();
  if (dt === 'real' || dt === 'float') {
    const buf = Buffer.alloc(4);
    buf.writeFloatBE(value, 0);
    return buf;
  }
  if (dt === 'int' || dt === 'int16') {
    const buf = Buffer.alloc(2);
    buf.writeInt16BE(Math.round(value), 0);
    return buf;
  }
  if (dt === 'dint' || dt === 'int32') {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(Math.round(value), 0);
    return buf;
  }
  if (dt === 'bool') {
    return Buffer.from([value ? 1 : 0]);
  }
  return Buffer.from([Math.round(value) & 0xff]);
}

function withTimeout<T>(ms: number, p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`PLC write timeout ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

interface S7Client {
  Connected(): boolean;
  ConnectTo(ip: string, rack: number, slot: number, cb: (err: any) => void): void;
  WriteArea(area: number, db: number, start: number, amount: number, wl: number, buf: Buffer, cb: (err: any) => void): void;
}

export class S7PlcWriter implements PlcWriter {
  private clients = new Map<string, S7Client>();
  private factory: () => S7Client;

  constructor(factory?: () => S7Client) {
    if (factory) {
      this.factory = factory;
    } else {
      this.factory = () => {
        const snap7 = require('node-snap7');
        return new snap7.S7Client();
      };
    }
  }

  private async getClient(conn: PLCConnectionConfig): Promise<S7Client> {
    let c = this.clients.get(conn.id);
    if (c && c.Connected()) return c;
    c = this.factory();
    this.clients.set(conn.id, c);
    await new Promise<void>((resolve, reject) => {
      c!.ConnectTo(conn.ip, conn.rack ?? 0, conn.slot ?? 1, (err: any) => {
        if (err) reject(new Error(`S7 ConnectTo ${err}`));
        else resolve();
      });
    });
    return c;
  }

  async write(conn: PLCConnectionConfig, mapping: PLCVariableMapping, value: number): Promise<void> {
    const client = await this.getClient(conn);
    const parsed = parseAddr(mapping.plc_address);
    const buf = encodeValue(value, mapping.data_type);
    await withTimeout(5000, new Promise<void>((resolve, reject) => {
      client.WriteArea(
        AREA_DB,
        parsed.db ?? conn.s7_db ?? 1,
        parsed.byteAddr ?? 0,
        buf.length,
        WORDLEN_BYTE,
        buf,
        (err: any) => err ? reject(new Error(`S7 WriteArea ${err}`)) : resolve()
      );
    }));
  }
}
```

- [ ] **Step 4: 看 GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/engine/__tests__/plc-writer.test.ts`
Expected: 3/3 PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/server/src/engine/plc-writer.ts packages/server/src/engine/__tests__/plc-writer.test.ts
git commit -m "feat(server/engine): S7PlcWriter — encode + connect + WriteArea + 5s timeout (2 tests)"
```

---

## Task 4: ModbusPlcWriter skeleton + 1 测试

**Files:**
- Modify: `packages/server/src/engine/plc-writer.ts`
- Modify: `packages/server/src/engine/__tests__/plc-writer.test.ts`

- [ ] **Step 1: 写测试**

追加到 `/Volumes/SSD/BIOCORE/packages/server/src/engine/__tests__/plc-writer.test.ts`:

```ts
import { ModbusPlcWriter } from '../plc-writer';

describe('ModbusPlcWriter', () => {
  it('throws NOT_IMPLEMENTED — skeleton awaiting hardware', async () => {
    const w = new ModbusPlcWriter();
    const conn = { id: 'c2', protocol: 'modbus', serial_port: '/dev/ttyUSB0' } as any;
    const mapping = { plc_address: '40001', data_type: 'int' } as any;
    await expect(w.write(conn, mapping, 1)).rejects.toThrow(/NOT_IMPLEMENTED/);
  });
});
```

- [ ] **Step 2: 看 RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/engine/__tests__/plc-writer.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 skeleton**

追加到 `/Volumes/SSD/BIOCORE/packages/server/src/engine/plc-writer.ts`:

```ts
export class ModbusPlcWriter implements PlcWriter {
  async write(_conn: PLCConnectionConfig, _mapping: PLCVariableMapping, _value: number): Promise<void> {
    throw new Error('NOT_IMPLEMENTED: Modbus writer pending hardware integration');
  }
}
```

- [ ] **Step 4: 看 GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/engine/__tests__/plc-writer.test.ts`
Expected: 4/4 PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/server/src/engine/plc-writer.ts packages/server/src/engine/__tests__/plc-writer.test.ts
git commit -m "feat(server/engine): ModbusPlcWriter skeleton — NOT_IMPLEMENTED pending hardware (1 test)"
```

---

## Task 5: createPlcWriter 工厂 + 路由分发 + 2 测试

**Files:**
- Modify: `packages/server/src/engine/plc-writer.ts`
- Modify: `packages/server/src/engine/__tests__/plc-writer.test.ts`

- [ ] **Step 1: 写测试**

追加到 `/Volumes/SSD/BIOCORE/packages/server/src/engine/__tests__/plc-writer.test.ts`:

```ts
import { createPlcWriter } from '../plc-writer';

describe('createPlcWriter factory', () => {
  it('returns MockPlcWriter when MOCK_PLC=true', () => {
    process.env.MOCK_PLC = 'true';
    const w = createPlcWriter('s7');
    expect((w as any).read).toBeDefined();
    delete process.env.MOCK_PLC;
  });

  it('throws for unsupported protocol', () => {
    process.env.MOCK_PLC = '';
    expect(() => createPlcWriter('opc-ua')).toThrow(/unsupported PLC protocol/);
  });
});
```

- [ ] **Step 2: 看 RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/engine/__tests__/plc-writer.test.ts`
Expected: FAIL (createPlcWriter undefined)

- [ ] **Step 3: 实现工厂**

追加到 `/Volumes/SSD/BIOCORE/packages/server/src/engine/plc-writer.ts`:

```ts
let s7Singleton: S7PlcWriter | null = null;
let modbusSingleton: ModbusPlcWriter | null = null;

export function createPlcWriter(protocol: string): PlcWriter {
  if (process.env.MOCK_PLC === 'true') return getMockPlcWriter();
  switch ((protocol || '').toLowerCase()) {
    case 's7':
      if (!s7Singleton) s7Singleton = new S7PlcWriter();
      return s7Singleton;
    case 'modbus':
    case 'modbus-rtu':
      if (!modbusSingleton) modbusSingleton = new ModbusPlcWriter();
      return modbusSingleton;
    default:
      throw new Error(`unsupported PLC protocol: ${protocol}`);
  }
}
```

- [ ] **Step 4: 看 GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/engine/__tests__/plc-writer.test.ts`
Expected: 6/6 PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/server/src/engine/plc-writer.ts packages/server/src/engine/__tests__/plc-writer.test.ts
git commit -m "feat(server/engine): createPlcWriter factory — MOCK_PLC short-circuit + protocol switch (2 tests)"
```

---

## Task 6: scada-write-dispatcher dispatchTick / dispatchOne / DispatchError + 4 测试

**Files:**
- Create: `packages/server/src/engine/scada-write-dispatcher.ts`
- Create: `packages/server/src/engine/__tests__/scada-write-dispatcher.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `/Volumes/SSD/BIOCORE/packages/server/src/engine/__tests__/scada-write-dispatcher.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '@biocore/data-service';
import { dispatchTick, DispatchError } from '../scada-write-dispatcher';
import { MockPlcWriter } from '../plc-writer';

function setup() {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../../migrations/001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../migrations/029-scada-dispatch.sql'), 'utf8'));
  db.prepare(`INSERT INTO batches (batch_id, recipe_id, started_at, current_state)
              VALUES ('b1', 1, datetime('now'), 'running')`).run();
  const sqlite = new SQLiteService(db);
  const writer = new MockPlcWriter();
  const mappingManager = {
    getVariables: () => [{
      id: 'v1', tag_name: 'F01.SP-temp', plc_address: 'DB1.DBD0',
      data_type: 'real', direction: 'write', scaling_enabled: 0,
      eng_min: 0, eng_max: 100, connection_id: 'c1', enabled: 1,
    }],
    getConnections: () => [{ id: 'c1', protocol: 's7', ip: '127.0.0.1', port: 102, rack: 0, slot: 1, s7_db: 1, enabled: 1 }],
  } as any;
  const broadcasts: any[] = [];
  const broadcast = (ch: string, p: any) => broadcasts.push({ ch, p });
  return { db, sqlite, writer, mappingManager, broadcasts, broadcast,
    writerFactory: (_proto: string) => writer };
}

describe('scada-write-dispatcher', () => {
  it('dispatchTick picks up pending row → marks dispatched (mock writer called)', async () => {
    const { db, sqlite, writer, mappingManager, broadcasts, broadcast, writerFactory } = setup();
    const id = sqlite.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'F01.SP-temp', suggested_value: 38, reasoning: '{}',
    });
    sqlite.setDispatchPending(id);

    await dispatchTick({ sqlite, broadcast, writerFactory, mappingManager });

    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('dispatched');
    expect(row.dispatched_at).toBeTruthy();
    expect(writer.read('c1', 'DB1.DBD0')).toBe(38);
    expect(broadcasts.some(b => b.ch === 'ai_suggestion' && b.p.action === 'dispatched')).toBe(true);
  });

  it('writer failure → retry_count=1, status back to pending_dispatch', async () => {
    const { db, sqlite, mappingManager, broadcast } = setup();
    const id = sqlite.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'F01.SP-temp', suggested_value: 38, reasoning: '{}',
    });
    sqlite.setDispatchPending(id);
    const failingWriter = { write: async () => { throw new Error('PLC timeout'); } };

    await dispatchTick({ sqlite, broadcast, writerFactory: () => failingWriter as any, mappingManager });

    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('pending_dispatch');
    expect(row.dispatch_retry_count).toBe(1);
  });

  it('3rd failure → status=failed + audit_log row', async () => {
    const { db, sqlite, mappingManager, broadcast } = setup();
    const id = sqlite.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'F01.SP-temp', suggested_value: 38, reasoning: '{}',
    });
    sqlite.setDispatchPending(id);
    const failingWriter = { write: async () => { throw new Error('PLC timeout'); } };
    const wf = () => failingWriter as any;

    await dispatchTick({ sqlite, broadcast, writerFactory: wf, mappingManager });
    sqlite.setDispatchPending(id);
    await dispatchTick({ sqlite, broadcast, writerFactory: wf, mappingManager });
    sqlite.setDispatchPending(id);
    await dispatchTick({ sqlite, broadcast, writerFactory: wf, mappingManager });

    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('failed');
    expect(row.dispatch_error).toMatch(/PLC timeout/);
    const audit: any = db.prepare(`SELECT * FROM audit_logs WHERE action='ai_suggestion_dispatch_failed' AND target_id=?`).get(String(id));
    expect(audit).toBeTruthy();
  });

  it('NO_MAPPING — permanent failure (no retry)', async () => {
    const { db, sqlite, broadcast } = setup();
    const id = sqlite.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'Unknown.Tag', suggested_value: 1, reasoning: '{}',
    });
    sqlite.setDispatchPending(id);
    const emptyMM = { getVariables: () => [], getConnections: () => [] } as any;

    await dispatchTick({ sqlite, broadcast, writerFactory: () => ({ write: async () => {} } as any), mappingManager: emptyMM });

    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('failed');
    expect(row.dispatch_error).toMatch(/no mapping/);
    expect(row.dispatch_retry_count).toBe(0);
  });
});
```

- [ ] **Step 2: 看 RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/engine/__tests__/scada-write-dispatcher.test.ts`
Expected: FAIL (module 不存在)

- [ ] **Step 3: 实现 dispatcher 核心**

创建 `/Volumes/SSD/BIOCORE/packages/server/src/engine/scada-write-dispatcher.ts`:

```ts
import type { PlcWriter } from './plc-writer';

const MAX_RETRIES = 3;
const BATCH_SIZE = 10;
const PERMANENT_CODES = new Set(['NO_MAPPING', 'NO_CONNECTION', 'READ_ONLY', 'NULL_VALUE', 'OUT_OF_RANGE']);

export class DispatchError extends Error {
  constructor(public code: string, msg: string) { super(msg); this.name = 'DispatchError'; }
}

interface MappingManagerShape {
  getVariables(): Array<{
    id: string; tag_name: string; plc_address: string; data_type: string;
    direction: string; scaling_enabled: number; eng_min: number; eng_max: number;
    connection_id: string; enabled?: number;
  }>;
  getConnections(): Array<{ id: string; protocol: string; ip?: string; rack?: number; slot?: number; s7_db?: number }>;
}

interface SQLiteShape {
  claimPendingDispatches(limit: number): any[];
  markDispatched(id: number): void;
  markDispatchFailed(id: number, err: string): void;
  incrementDispatchRetry(id: number): void;
  rollbackInProgressDispatches(): void;
  writeAuditLog(log: any): void;
}

export interface DispatcherDeps {
  sqlite: SQLiteShape;
  broadcast: (channel: string, payload: any) => void;
  writerFactory: (protocol: string) => PlcWriter;
  mappingManager: MappingManagerShape;
}

export async function dispatchTick(deps: DispatcherDeps): Promise<void> {
  const claimed = deps.sqlite.claimPendingDispatches(BATCH_SIZE);
  for (const row of claimed) {
    await dispatchOne(row, deps);
  }
}

async function dispatchOne(row: any, deps: DispatcherDeps): Promise<void> {
  try {
    const mapping = deps.mappingManager.getVariables().find((v) => v.tag_name === row.target_param);
    if (!mapping) throw new DispatchError('NO_MAPPING', `no mapping for tag ${row.target_param}`);
    if (mapping.direction !== 'write') throw new DispatchError('READ_ONLY', `tag ${row.target_param} is read-only`);
    if (row.suggested_value == null) throw new DispatchError('NULL_VALUE', 'suggested_value is null');
    if (mapping.scaling_enabled && (row.suggested_value < mapping.eng_min || row.suggested_value > mapping.eng_max)) {
      throw new DispatchError('OUT_OF_RANGE', `${row.suggested_value} out of [${mapping.eng_min},${mapping.eng_max}]`);
    }
    const conn = deps.mappingManager.getConnections().find((c) => c.id === mapping.connection_id);
    if (!conn) throw new DispatchError('NO_CONNECTION', `connection ${mapping.connection_id} not found`);

    const writer = deps.writerFactory(conn.protocol);
    await writer.write(conn as any, mapping as any, row.suggested_value);

    deps.sqlite.markDispatched(row.id);
    deps.broadcast('ai_suggestion', {
      id: row.id, action: 'dispatched', source_module: 'scada',
      target_param: row.target_param, suggested_value: row.suggested_value,
    });
    deps.sqlite.writeAuditLog({
      user_id: row.decided_by ?? 'system',
      action: 'ai_suggestion_dispatched',
      target_type: 'ai_suggestion',
      target_id: String(row.id),
      new_value: JSON.stringify({ tag: row.target_param, value: row.suggested_value }),
    });
  } catch (e) {
    const err = e as Error;
    const isPermanent = err instanceof DispatchError && PERMANENT_CODES.has(err.code);
    const nextRetry = (row.dispatch_retry_count ?? 0) + 1;
    if (isPermanent || nextRetry >= MAX_RETRIES) {
      deps.sqlite.markDispatchFailed(row.id, err.message);
      deps.broadcast('ai_suggestion', {
        id: row.id, action: 'dispatch_failed', source_module: 'scada', error: err.message,
      });
      deps.sqlite.writeAuditLog({
        user_id: row.decided_by ?? 'system',
        action: 'ai_suggestion_dispatch_failed',
        target_type: 'ai_suggestion',
        target_id: String(row.id),
        new_value: JSON.stringify({ error: err.message, retry: nextRetry }),
      });
    } else {
      deps.sqlite.incrementDispatchRetry(row.id);
    }
  }
}
```

- [ ] **Step 4: 看 GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/engine/__tests__/scada-write-dispatcher.test.ts`
Expected: 4/4 PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/server/src/engine/scada-write-dispatcher.ts packages/server/src/engine/__tests__/scada-write-dispatcher.test.ts
git commit -m "feat(server/engine): scada-write-dispatcher — claim + retry state machine + audit (4 tests)"
```

---

## Task 7: dispatcher 生命周期 (startScadaWriteDispatcher + stop) + rollback + 1 测试

**Files:**
- Modify: `packages/server/src/engine/scada-write-dispatcher.ts`
- Modify: `packages/server/src/engine/__tests__/scada-write-dispatcher.test.ts`

- [ ] **Step 1: 写测试**

追加到 `/Volumes/SSD/BIOCORE/packages/server/src/engine/__tests__/scada-write-dispatcher.test.ts`:

```ts
import { startScadaWriteDispatcher } from '../scada-write-dispatcher';

describe('startScadaWriteDispatcher lifecycle', () => {
  it('on start, rolls back dispatching rows to pending_dispatch', () => {
    const { db, sqlite, mappingManager, writerFactory, broadcast } = setup();
    const id = sqlite.createSuggestion({
      batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
      target_param: 'F01.SP-temp', suggested_value: 1, reasoning: '{}',
    });
    sqlite.setDispatchPending(id);
    db.prepare("UPDATE ai_suggestions SET dispatch_status='dispatching' WHERE id=?").run(id);

    const handle = startScadaWriteDispatcher({ sqlite, mappingManager, writerFactory, broadcast, tickMs: 60_000 });
    const row: any = db.prepare('SELECT dispatch_status FROM ai_suggestions WHERE id=?').get(id);
    expect(row.dispatch_status).toBe('pending_dispatch');
    handle.stop();
  });
});
```

- [ ] **Step 2: 看 RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/engine/__tests__/scada-write-dispatcher.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 lifecycle**

追加到 `/Volumes/SSD/BIOCORE/packages/server/src/engine/scada-write-dispatcher.ts`:

```ts
const DEFAULT_TICK_MS = 500;

export interface DispatcherHandle { stop(): void; }

export function startScadaWriteDispatcher(
  deps: DispatcherDeps & { tickMs?: number }
): DispatcherHandle {
  deps.sqlite.rollbackInProgressDispatches();
  const tickMs = deps.tickMs ?? DEFAULT_TICK_MS;
  const timer = setInterval(() => {
    dispatchTick(deps).catch((err) => {
      console.error('[scada-dispatcher] tick error:', err);
    });
  }, tickMs);
  return { stop: () => clearInterval(timer) };
}
```

- [ ] **Step 4: 看 GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/engine/__tests__/scada-write-dispatcher.test.ts`
Expected: 5/5 PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/server/src/engine/scada-write-dispatcher.ts packages/server/src/engine/__tests__/scada-write-dispatcher.test.ts
git commit -m "feat(server/engine): startScadaWriteDispatcher — 500ms tick + rollback on start (1 test)"
```

---

## Task 8: accept handler 加 setDispatchPending + boot wire dispatcher + 1 集成测试

**Files:**
- Modify: `packages/server/src/index.ts` (accept handler ~line 2836; boot ~line 3261)
- Create: `packages/server/src/__tests__/ai-suggestions-dispatch.test.ts`

- [ ] **Step 1: 写集成测试**

创建 `/Volumes/SSD/BIOCORE/packages/server/src/__tests__/ai-suggestions-dispatch.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { SQLiteService } from '@biocore/data-service';

let app: express.Express;
let svc: SQLiteService;
let db: Database.Database;
let scadaId: number;

beforeAll(() => {
  db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../migrations/001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../migrations/029-scada-dispatch.sql'), 'utf8'));
  db.prepare(`INSERT INTO batches (batch_id, recipe_id, started_at, current_state)
              VALUES ('b1', 1, datetime('now'), 'running')`).run();
  svc = new SQLiteService(db);
  scadaId = svc.createSuggestion({
    batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
    target_param: 'F01.SP-temp', suggested_value: 38, reasoning: '{}',
  });

  app = express();
  app.use(express.json());
  app.use((req: any, _r, n) => { req.user = { user_id: 'admin-001', role: 'admin' }; n(); });
  app.post('/ai/suggestions/:id/accept', (req: any, res) => {
    try {
      svc.acceptSuggestion(parseInt(req.params.id), req.user.user_id);
      svc.setDispatchPending(parseInt(req.params.id));
      svc.writeAuditLog({
        user_id: req.user.user_id, action: 'ai_suggestion_accept',
        target_type: 'ai_suggestion', target_id: req.params.id,
      });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
});

describe('POST /ai/suggestions/:id/accept', () => {
  it('marks SCADA suggestion as pending_dispatch after accept', async () => {
    const r = await request(app).post(`/ai/suggestions/${scadaId}/accept`);
    expect(r.status).toBe(200);
    const row: any = db.prepare('SELECT * FROM ai_suggestions WHERE id=?').get(scadaId);
    expect(row.status).toBe('accepted');
    expect(row.dispatch_status).toBe('pending_dispatch');
  });
});
```

- [ ] **Step 2: 看 RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/__tests__/ai-suggestions-dispatch.test.ts`
Expected: test fails (`svc.setDispatchPending is not a function` until data-service `npm run build` from Task 1 has propagated; if Task 1 build complete, test should already PASS)

- [ ] **Step 3: 修改 production accept handler**

打开 `/Volumes/SSD/BIOCORE/packages/server/src/index.ts`,定位 `apiRouter.post('/ai/suggestions/:id/accept'`(约 line 2836)。在 `sqlite.acceptSuggestion(...)` 之后追加 1 行:

```ts
sqlite.setDispatchPending(parseInt(req.params.id));
```

完整 handler 改为:

```ts
apiRouter.post('/ai/suggestions/:id/accept', (req: any, res) => {
  try {
    sqlite.acceptSuggestion(parseInt(req.params.id), req.user?.user_id || 'admin-001');
    sqlite.setDispatchPending(parseInt(req.params.id));
    sqlite.writeAuditLog({
      user_id: req.user?.user_id || 'admin-001',
      action: 'ai_suggestion_accept',
      target_type: 'ai_suggestion',
      target_id: req.params.id,
      ip_address: req.ip || req.socket?.remoteAddress || null,
      trace_id: req.trace_id,
    });
    broadcast('ai_suggestion', { id: parseInt(req.params.id), action: 'accepted' });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
```

- [ ] **Step 4: 启动接入 dispatcher**

文件顶部 import 区追加:

```ts
import { startScadaWriteDispatcher } from './engine/scada-write-dispatcher';
import { createPlcWriter } from './engine/plc-writer';
```

在 `server.listen(PORT, ...)` (约 line 3261) 之前追加:

```ts
const scadaDispatcherHandle = startScadaWriteDispatcher({
  sqlite,
  broadcast,
  writerFactory: createPlcWriter,
  mappingManager: varManager,
});
process.on('SIGTERM', () => scadaDispatcherHandle.stop());
process.on('SIGINT', () => scadaDispatcherHandle.stop());
```

(`varManager` 已在 line 270 实例化, `broadcast` 和 `sqlite` 已存在)

- [ ] **Step 5: 看 GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run src/__tests__/ai-suggestions-dispatch.test.ts`
Expected: 1/1 PASS

- [ ] **Step 6: TS 编译**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx tsc --noEmit`
Expected: 0 new errors

- [ ] **Step 7: 提交**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/server/src/index.ts packages/server/src/__tests__/ai-suggestions-dispatch.test.ts
git commit -m "feat(server): accept handler triggers setDispatchPending; boot starts scada-write-dispatcher (1 test)"
```

---

## Task 9: web-ui — ScadaSuggestion 类型 + SuggestionRow 徽章 + 2 测试

**Files:**
- Modify: `packages/web-ui/src/api/scada.ts`
- Modify: `packages/web-ui/src/components/scada/suggestions/SuggestionRow.tsx`
- Create: `packages/web-ui/src/components/scada/suggestions/__tests__/SuggestionRow.dispatch.test.tsx`

- [ ] **Step 1: 扩展类型**

打开 `/Volumes/SSD/BIOCORE/packages/web-ui/src/api/scada.ts`,找到 `export interface ScadaSuggestion`,在末尾字段之后追加:

```ts
export interface ScadaSuggestion {
  // ...现有字段保留
  dispatch_status?: 'pending_dispatch' | 'dispatching' | 'dispatched' | 'failed' | null;
  dispatch_retry_count?: number;
  dispatched_at?: string | null;
  dispatch_error?: string | null;
}
```

- [ ] **Step 2: 写徽章测试**

创建 `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/suggestions/__tests__/SuggestionRow.dispatch.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SuggestionRow } from '../SuggestionRow';

const base: any = {
  id: 1, batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
  target_param: 'F01.SP-temp', current_value: null, suggested_value: 38,
  confidence: null, reasoning: '{}', status: 'accepted',
  created_at: '2026-05-15T00:00:00Z', expires_at: null,
  decided_by: 'admin', decided_at: '2026-05-15T00:01:00Z',
};

describe('SuggestionRow dispatch badge', () => {
  it('renders 已下发 badge when dispatch_status=dispatched', () => {
    render(<SuggestionRow suggestion={{ ...base, dispatch_status: 'dispatched' }} onAccept={() => {}} onReject={() => {}} />);
    expect(screen.getByText('已下发')).toBeTruthy();
  });

  it('renders 下发失败 badge with dispatch_error title when failed', () => {
    const { container } = render(<SuggestionRow suggestion={{ ...base, dispatch_status: 'failed', dispatch_error: 'PLC timeout' }} onAccept={() => {}} onReject={() => {}} />);
    expect(screen.getByText('下发失败')).toBeTruthy();
    const badge = container.querySelector('[title="PLC timeout"]');
    expect(badge).toBeTruthy();
  });
});
```

- [ ] **Step 3: 看 RED**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npx vitest run src/components/scada/suggestions/__tests__/SuggestionRow.dispatch.test.tsx`
Expected: FAIL (badge 未实现)

- [ ] **Step 4: 修改 SuggestionRow**

打开 `/Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/suggestions/SuggestionRow.tsx`。在 `import` 块之后(函数声明上方)加 helper:

```tsx
const DISPATCH_LABELS: Record<string, string> = {
  pending_dispatch: '待下发',
  dispatching: '下发中',
  dispatched: '已下发',
  failed: '下发失败',
};

const DISPATCH_COLORS: Record<string, string> = {
  pending_dispatch: 'bg-yellow-100 text-yellow-700',
  dispatching: 'bg-blue-100 text-blue-700',
  dispatched: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};
```

把现有 header div:

```tsx
<div className="flex items-baseline justify-between">
  <div className="font-mono text-sm">{suggestion.target_param}</div>
  <span className="text-xs text-gray-400">#{suggestion.id} · {suggestion.created_at}</span>
</div>
```

改为:

```tsx
<div className="flex items-baseline justify-between gap-2">
  <div className="font-mono text-sm">{suggestion.target_param}</div>
  <div className="flex items-center gap-2">
    {suggestion.dispatch_status && DISPATCH_LABELS[suggestion.dispatch_status] && (
      <span
        title={suggestion.dispatch_error ?? undefined}
        className={`text-xs px-2 py-0.5 rounded ${DISPATCH_COLORS[suggestion.dispatch_status]}`}
      >
        {DISPATCH_LABELS[suggestion.dispatch_status]}
      </span>
    )}
    <span className="text-xs text-gray-400">#{suggestion.id} · {suggestion.created_at}</span>
  </div>
</div>
```

- [ ] **Step 5: 看 GREEN**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npx vitest run src/components/scada/suggestions/__tests__/SuggestionRow.dispatch.test.tsx`
Expected: 2/2 PASS

- [ ] **Step 6: 回归既有测试**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npx vitest run src/components/scada/suggestions/__tests__/SuggestionRow.test.tsx`
Expected: 2/2 PASS (徽章 conditional 不破坏既有 assert)

- [ ] **Step 7: 提交**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/api/scada.ts packages/web-ui/src/components/scada/suggestions/SuggestionRow.tsx packages/web-ui/src/components/scada/suggestions/__tests__/SuggestionRow.dispatch.test.tsx
git commit -m "feat(web-ui): SuggestionRow dispatch_status badge — 待下发/下发中/已下发/失败 (2 tests)"
```

---

## Task 10: realtime-store — 验证 dispatched / dispatch_failed 透传 (无新代码)

**Files:** 无新文件,无修改

- [ ] **Step 1: 跑 realtime-scada-source 测试**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npx vitest run src/stores/__tests__/realtime-scada-source.test.ts`
Expected: 1/1 PASS

- [ ] **Step 2: 跑 useScadaSuggestions 测试**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npx vitest run src/hooks/__tests__/useScadaSuggestions.test.ts`
Expected: 4/4 PASS

- [ ] **Step 3: 验证 AiSuggestion interface 已含 action 字段**

读 `/Volumes/SSD/BIOCORE/packages/web-ui/src/stores/realtime-store.ts`,确认 `interface AiSuggestion` 含 `action?: string`(子项目 6 Task 4 已加)。无需修改。WS payload 含 `action='dispatched'\|'dispatch_failed'` 时,dispatcher spread 进 store,hook 的 debounced refetch 已订阅 `latest?.id`,任何 id 不变也会刷新 (实际触发: 同一 id 多次 broadcast → React useEffect 依赖比较 → 同 id 不触发,但 next broadcast 含 source_module=scada 即触发新 effect)。

- [ ] **Step 4: 无提交** (验证任务)

---

## Task 11: 全套测试 + TS 全包检查

**Files:** 无修改

- [ ] **Step 1: data-service**

Run: `cd /Volumes/SSD/BIOCORE/packages/data-service && npm run build && npx vitest run`
Expected: 全绿

- [ ] **Step 2: server**

Run: `cd /Volumes/SSD/BIOCORE/packages/server && npx vitest run`
Expected: 全绿 (基线 58 + 子项目 7 新增 ~12 → ~70)

- [ ] **Step 3: web-ui**

Run: `cd /Volumes/SSD/BIOCORE/packages/web-ui && npx vitest run`
Expected: 全绿 (基线 101 + 子项目 7 新增 2 → 103)

- [ ] **Step 4: TS 全包**

```bash
cd /Volumes/SSD/BIOCORE/packages/data-service && npx tsc --noEmit
cd /Volumes/SSD/BIOCORE/packages/server && npx tsc --noEmit
cd /Volumes/SSD/BIOCORE/packages/web-ui && npx tsc --noEmit
```

Expected: 三包 0 新错误

- [ ] **Step 5: 无提交** (验证任务)

---

## Task 12: 浏览器 DoD (MOCK_PLC=true) + 最终 review + 标记 Done

**Files:**
- Modify: `docs/superpowers/specs/2026-05-15-scada-engine-plc-writer-design.md` (Status: Draft → Done)

- [ ] **Step 1: 启动服务 (MOCK_PLC=true)**

```bash
# server (port 3001) — terminal 1
cd /Volumes/SSD/BIOCORE/packages/server
MOCK_PLC=true npm run dev
```

```bash
# web-ui (port 3000) — terminal 2
cd /Volumes/SSD/BIOCORE/packages/web-ui
npm run dev
```

(若已有 dev server 跑着, 先 kill 旧的 + 用 MOCK_PLC=true 重启 server)

- [ ] **Step 2: 预置 mapping**

```bash
sqlite3 /Volumes/SSD/BIOCORE/packages/server/data/biocore.db <<EOF
INSERT OR IGNORE INTO plc_connections (id, name, protocol, ip, port, rack, slot, s7_db, heartbeat_write_address, heartbeat_read_address, heartbeat_timeout_ms, reconnect_interval_ms, enabled)
  VALUES ('c1', 'demo-s7', 's7', '127.0.0.1', 102, 0, 1, 1, 'VB400', 'VB401', 3000, 5000, 1);
INSERT OR REPLACE INTO plc_variable_mappings
  (id, tag_name, description, plc_address, data_type, direction, scaling_enabled, raw_min, raw_max, eng_min, eng_max, eng_unit, "group", poll_rate_ms, enabled, connection_id)
  VALUES ('v1', 'F01.SP-temp', 'demo setpoint', 'DB1.DBD0', 'real', 'write', 0, 0, 27648, 0, 100, '℃', '模拟量输出', 1000, 1, 'c1');
EOF
```

(SQLite DB 路径若与本机不同, 用 `find packages/server -name "*.db"` 找)

- [ ] **Step 3: 浏览器流程**

1. `http://localhost:3000/login` → `admin / admin123`
2. `/scada/demo_v1` → 点 button widget → reason "下发 DoD" → 提交
3. `/scada/suggestions` → 见新行 (徽章应无, 尚未 accept)
4. 点 [接受] → 行 refetch:
   - 短暂: 徽章 "待下发"
   - ~500ms 后再 refetch: 徽章 "已下发"
5. devtools console: 0 errors

- [ ] **Step 4: 重启续上验证**

kill server, MOCK_PLC=true 重启, 重新登录 `/scada/suggestions` → dispatched 行仍存并显 "已下发"。

- [ ] **Step 5: 失败路径验证**

```bash
sqlite3 /Volumes/SSD/BIOCORE/packages/server/data/biocore.db "UPDATE plc_variable_mappings SET direction='read' WHERE tag_name='F01.SP-temp'"
```

触发新 widget click → accept → < 1s 显示 "下发失败" 徽章 (hover 显 `tag F01.SP-temp is read-only`)。

恢复:
```bash
sqlite3 /Volumes/SSD/BIOCORE/packages/server/data/biocore.db "UPDATE plc_variable_mappings SET direction='write' WHERE tag_name='F01.SP-temp'"
```

- [ ] **Step 6: audit_log 验证**

```bash
sqlite3 /Volumes/SSD/BIOCORE/packages/server/data/biocore.db "SELECT action, target_id, new_value FROM audit_logs WHERE action LIKE 'ai_suggestion_dispatch%' ORDER BY id DESC LIMIT 10"
```

Expected: ≥1 行 `ai_suggestion_dispatched` + ≥1 行 `ai_suggestion_dispatch_failed`

- [ ] **Step 7: 最终 review (可选 agent)**

```bash
cd /Volumes/SSD/BIOCORE
git log --oneline 64240e8..HEAD | head -25
```

可选调 `everything-claude-code:code-reviewer` agent 输入子项目 7 diff, 确认 0 CRITICAL/HIGH。

- [ ] **Step 8: 标记 spec Done + 提交**

修改 `/Volumes/SSD/BIOCORE/docs/superpowers/specs/2026-05-15-scada-engine-plc-writer-design.md` 第 4 行 `**Status:** Draft` → `**Status:** Done`。

```bash
cd /Volumes/SSD/BIOCORE
git add docs/superpowers/specs/2026-05-15-scada-engine-plc-writer-design.md
git commit -m "docs(scada): mark sub-project 7/7 done — engine PLC writer end-to-end verified (MOCK_PLC)"
```

**SCADA 子系统 7/7 全部完成。** 后续 P2:
- dispatch_failed 红色 toast
- 操作员手动 retry 按钮
- 写后回读校验
- ModbusPlcWriter 实写实现 (硬件到位后)
- controller plcWrite stub 填实 (与本 dispatcher 解耦)
