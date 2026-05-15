# SCADA Engine PLC 写下发设计 (子项目 7/7)

**Branch:** `feat/scada-data-model`
**Status:** Done
**Scope:** 闭环 SCADA write-intent 路径最后一环 — operator accept 后,engine daemon 异步把 `suggested_value` 写到 PLC (S7 或 Modbus),失败可重试,审计每次下发。**仅本子项目完成后,SCADA widget 点击才真正影响生产。**

---

## 1. 上下文

- 子项目 1-6 已交付: SCADA project/view CRUD、widget 编辑器、write-intent → ai_suggestions、operator review UI + WS toast、accept/reject REST
- 当前 accept handler (`packages/server/src/index.ts:2836-2853`) 只更新 status + audit + broadcast,**未触发 PLC 写**
- `batch-controller` 的 `plcWrite` 已是空 stub (line 2981): `async (_tag, _value) => {}` — 本子项目不去填它 (controller 由 recipe 步骤驱动,与 SCADA 手动写不同路径)
- `plc-driver` 包已有: `S7Client` (snap7), `modbus-serial` dep, `VariableMappingManager` (tag → plc_address 映射), `validateAddr` / `parseAddr` / `byteLen` / `decode` / `scale`
- `MOCK_PLC=true` 环境变量已在 `plc-bridge.ts` 控制读路径走模拟,本子项目沿用同一开关

### 安全约束 (verbatim)

> "AI / HMI / 外部系统 永不直写 PLC. 一律走"建议缓冲区"-"人工确认"-"engine 下发""

> "PLC 通讯：node-snap7（S7 协议）+ modbus-serial（Modbus RTU），不用 nodes7"

本设计严格遵守: 客户端永不直写,仅 server engine 持有 `S7Client` / `ModbusClient` 实例;writes 通过 `ai_suggestions` SQLite 表流转。

## 2. 架构

```
┌─ HTTP accept handler (现有) ────────────────────────────────┐
│  POST /api/v1/ai/suggestions/:id/accept                    │
│   1. sqlite.acceptSuggestion(id, user)  (现有)             │
│   2. 新增: sqlite.setDispatchPending(id)                   │
│        UPDATE ai_suggestions SET                           │
│          dispatch_status='pending_dispatch'                │
│        WHERE id=? AND suggestion_type='widget_button'      │
│        AND source_module='scada'                           │
│        (非 SCADA 行 → 不动 dispatch_status,保持 NULL)      │
│   3. audit + broadcast (现有)                              │
│   4. res.json({success:true})  ← 立即返回                  │
└────────────────────────────────────────────────────────────┘
                       ↓ (SQLite 行新增)
┌─ engine/scada-write-dispatcher.ts (新, daemon) ────────────┐
│  setInterval(500ms):                                        │
│   1. claim:                                                 │
│      UPDATE ai_suggestions SET                              │
│        dispatch_status='dispatching'                        │
│      WHERE id IN (                                          │
│        SELECT id FROM ai_suggestions                        │
│        WHERE dispatch_status='pending_dispatch' LIMIT 10    │
│      ) RETURNING *;                                         │
│   2. 每行: dispatchOne(row)                                 │
│        a. lookup mapping by row.target_param                │
│        b. validate direction='write' / value 类型 / range   │
│        c. plcWriter.write(connection, mapping, value)       │
│        d. 成功: mark 'dispatched' + audit + broadcast       │
│        e. 失败: retry_count++;                              │
│           - <3 → mark 'pending_dispatch' (下轮重试)         │
│           - =3 → mark 'failed' + audit + broadcast          │
│                                                             │
│  停机退出: clearInterval + 把 'dispatching' 行回滚到        │
│  'pending_dispatch' (startup 时检测残留并回滚)              │
└────────────────────────────────────────────────────────────┘
                       ↓
┌─ engine/plc-writer.ts (新, abstract) ──────────────────────┐
│  PlcWriter interface:                                       │
│    write(conn, mapping, value): Promise<void>              │
│                                                             │
│  实现:                                                       │
│   - MockPlcWriter (MOCK_PLC=true): 写 in-mem Map,返回成功  │
│   - S7PlcWriter: 用 plc-driver S7Client.WriteArea          │
│   - ModbusPlcWriter: 用 modbus-serial writeRegister        │
│  工厂: createPlcWriter(conn.protocol) → 实现                │
└────────────────────────────────────────────────────────────┘
```

### 2.1 文件清单

| 文件 | 职责 | 测试 |
|---|---|---|
| `packages/server/src/engine/scada-write-dispatcher.ts` (新) | daemon loop + 状态机 + retry | 5 |
| `packages/server/src/engine/plc-writer.ts` (新) | 抽象写接口 + Mock/S7/Modbus 适配 | 3 |
| `packages/server/migrations/029-scada-dispatch.sql` (新) | schema 扩展 | — |
| `packages/data-service/src/sqlite-service.ts` (修) | + dispatch 状态方法 | 4 |
| `packages/server/src/index.ts` (修) | accept 调 setDispatchPending; startup 启 dispatcher + 回滚残留 | 1 |
| `packages/server/src/startup.ts` (修) | dispatcher 生命周期 + cleanup | (整合于 dispatcher 测试) |
| `packages/web-ui/src/api/scada.ts` (修) | ScadaSuggestion 类型加 dispatch_status 字段 | — |
| `packages/web-ui/src/components/scada/suggestions/SuggestionRow.tsx` (修) | 渲染 dispatch_status 徽章 | 1 |
| `packages/web-ui/src/stores/realtime-store.ts` (修) | 处理 action='dispatched' \| 'dispatch_failed' | — |

依赖: 无新 npm (snap7 + modbus-serial 已装)。

### 2.2 测试矩阵 (~14)

| 测试 | Case | 描述 |
|---|---|---|
| sqlite-service.dispatch | 1 | setDispatchPending 只对 widget_button + scada 行生效 |
| | 2 | claimPendingDispatches 返回 dispatch_status='pending_dispatch' 行 (LIMIT N) 并 mark 'dispatching' |
| | 3 | markDispatched 改 status + 写 dispatched_at |
| | 4 | markDispatchFailed 写 dispatch_error |
| plc-writer | 1 | MockPlcWriter 写 in-mem 后可读回 |
| | 2 | S7PlcWriter 模拟 S7Client.WriteArea 成功 callback → resolve |
| | 3 | S7PlcWriter callback err → reject with Error |
| scada-write-dispatcher | 1 | dispatchTick 拾取 1 pending → mock writer 调用 → marked 'dispatched' |
| | 2 | 写失败 → retry_count=1, status 回 'pending_dispatch' |
| | 3 | 第 3 次失败 → status='failed' + audit_log 行 |
| | 4 | mapping 不存在 → 立即 'failed' (无重试) |
| | 5 | startup 回滚 'dispatching' 残留 → 'pending_dispatch' |
| accept handler | 1 | accept SCADA suggestion → dispatch_status='pending_dispatch' |
| SuggestionRow | 1 | dispatch_status='dispatched'/'failed' 渲染对应徽章 |

## 3. Schema 扩展 (migration 029)

```sql
-- packages/server/migrations/029-scada-dispatch.sql
ALTER TABLE ai_suggestions ADD COLUMN dispatch_status TEXT;
  -- NULL (默认, 非 SCADA / 未 accept)
  -- 'pending_dispatch' (待 daemon 拾取)
  -- 'dispatching' (daemon 持有, 防双写)
  -- 'dispatched' (成功)
  -- 'failed' (3 次重试后失败)
ALTER TABLE ai_suggestions ADD COLUMN dispatch_retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_suggestions ADD COLUMN dispatched_at TEXT;
ALTER TABLE ai_suggestions ADD COLUMN dispatch_error TEXT;
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_pending_dispatch
  ON ai_suggestions(dispatch_status)
  WHERE dispatch_status IN ('pending_dispatch', 'dispatching');
```

回滚 SQL (`029-scada-dispatch.down.sql`, 可选): `ALTER TABLE DROP COLUMN ...` (SQLite 3.35+) — 仅用于本地开发回退。

## 4. 数据流

### 4.1 Accept 触发

`apiRouter.post('/ai/suggestions/:id/accept', ...)` 在现有 `sqlite.acceptSuggestion()` 后追加:

```ts
sqlite.acceptSuggestion(id, userId);          // 现有
sqlite.setDispatchPending(id);                // 新: 仅 SCADA 行生效
sqlite.writeAuditLog({ ... });                // 现有
broadcast('ai_suggestion', { id, action: 'accepted' });  // 现有
```

`setDispatchPending` SQL:
```sql
UPDATE ai_suggestions
SET dispatch_status = 'pending_dispatch'
WHERE id = ? AND suggestion_type = 'widget_button' AND source_module = 'scada';
```

非 SCADA 行 (e.g. AI engine 建议) `dispatch_status` 保持 NULL,不参与下发,避免误下发。

### 4.2 Dispatcher 主循环

```ts
// packages/server/src/engine/scada-write-dispatcher.ts
const TICK_MS = 500;
const MAX_RETRIES = 3;
const BATCH_SIZE = 10;

export function startScadaWriteDispatcher(deps: {
  sqlite: SqliteService;
  broadcast: BroadcastFn;
  writerFactory: (protocol: string) => PlcWriter;
  mappingManager: VariableMappingManager;
}): { stop: () => void } {
  // startup 回滚: 'dispatching' → 'pending_dispatch'
  sqlite.rollbackInProgressDispatches();

  const timer = setInterval(() => dispatchTick(deps).catch(err =>
    console.error('[scada-dispatcher] tick error:', err)
  ), TICK_MS);

  return { stop: () => clearInterval(timer) };
}

async function dispatchTick(deps): Promise<void> {
  const claimed = sqlite.claimPendingDispatches(BATCH_SIZE);
  for (const row of claimed) {
    await dispatchOne(row, deps);
  }
}

async function dispatchOne(row, deps): Promise<void> {
  try {
    // VariableMappingManager 现有 API: getVariables() + getConnections().
    // 不另加 lookupByTag / getConnection 接口, 由 dispatcher 内 find 简单查找
    // (variable + connection 集合常驻内存, find O(n) 可接受, n < 200).
    const mapping = mappingManager.getVariables().find((v) => v.tag_name === row.target_param);
    if (!mapping) throw new DispatchError('NO_MAPPING', `no mapping for tag ${row.target_param}`);
    if (mapping.direction !== 'write') throw new DispatchError('READ_ONLY', `tag ${row.target_param} is read-only`);
    if (row.suggested_value == null) throw new DispatchError('NULL_VALUE', 'suggested_value is null');
    if (mapping.scaling_enabled && (row.suggested_value < mapping.eng_min || row.suggested_value > mapping.eng_max)) {
      throw new DispatchError('OUT_OF_RANGE', `${row.suggested_value} out of [${mapping.eng_min},${mapping.eng_max}]`);
    }

    const conn = mappingManager.getConnections().find((c) => c.id === mapping.connection_id);
    if (!conn) throw new DispatchError('NO_CONNECTION', `connection ${mapping.connection_id} not found`);
    const writer = writerFactory(conn.protocol);
    await writer.write(conn, mapping, row.suggested_value);

    sqlite.markDispatched(row.id);
    broadcast('ai_suggestion', { id: row.id, action: 'dispatched', source_module: 'scada' });
    sqlite.writeAuditLog({
      user_id: row.decided_by ?? 'system',
      action: 'ai_suggestion_dispatched',
      target_type: 'ai_suggestion',
      target_id: String(row.id),
      new_value: JSON.stringify({ tag: row.target_param, value: row.suggested_value }),
    });
  } catch (e) {
    const err = e as Error;
    const isPermanent = err instanceof DispatchError && ['NO_MAPPING', 'NO_CONNECTION', 'READ_ONLY', 'NULL_VALUE', 'OUT_OF_RANGE'].includes(err.code);
    if (isPermanent || row.dispatch_retry_count + 1 >= MAX_RETRIES) {
      sqlite.markDispatchFailed(row.id, err.message);
      broadcast('ai_suggestion', { id: row.id, action: 'dispatch_failed', source_module: 'scada', error: err.message });
      sqlite.writeAuditLog({
        user_id: row.decided_by ?? 'system',
        action: 'ai_suggestion_dispatch_failed',
        target_type: 'ai_suggestion',
        target_id: String(row.id),
        new_value: JSON.stringify({ error: err.message, retry: row.dispatch_retry_count + 1 }),
      });
    } else {
      sqlite.incrementDispatchRetry(row.id);  // status 回 pending_dispatch, retry_count++
    }
  }
}
```

`DispatchError` 区分永久 vs 瞬时;永久错误不重试 (节省 PLC 通讯)。

### 4.3 PLC Writer 适配

```ts
// packages/server/src/engine/plc-writer.ts
export interface PlcWriter {
  write(conn: PLCConnectionConfig, mapping: PLCVariableMapping, value: number): Promise<void>;
}

class MockPlcWriter implements PlcWriter {
  private mem = new Map<string, number>();
  async write(conn, mapping, value) {
    const key = `${conn.id}:${mapping.plc_address}`;
    this.mem.set(key, value);
  }
  read(connId: string, addr: string): number | undefined {
    return this.mem.get(`${connId}:${addr}`);
  }
}

class S7PlcWriter implements PlcWriter {
  // 共享 S7Client 池;每 conn.id 一个 client,初始连接 + 重连复用现有 plc-driver 模式
  // 单次 write 超时 5s
  async write(conn, mapping, value): Promise<void> {
    const client = await this.getClient(conn);
    const { area, db, byteAddr } = parseAddr(mapping.plc_address);
    const buf = encodeValue(value, mapping.data_type, mapping.scaling_enabled, mapping);
    await withTimeout(5000, new Promise<void>((resolve, reject) => {
      client.WriteArea(area, db, byteAddr, buf.length, WORDLEN_BYTE, buf, (err: any) => {
        if (err) reject(new Error(`S7 WriteArea ${err}`));
        else resolve();
      });
    }));
  }
}

class ModbusPlcWriter implements PlcWriter {
  // modbus-serial RTU; 共享 client 池 per conn.id
  async write(conn, mapping, value): Promise<void> { /* writeRegister(addr, scaled) */ }
}

export function createPlcWriter(protocol: string): PlcWriter {
  if (MOCK_PLC) return MOCK_WRITER;  // 全局单例
  switch (protocol) {
    case 's7': return getOrCreateS7Writer();
    case 'modbus': return getOrCreateModbusWriter();
    default: throw new Error(`unsupported PLC protocol: ${protocol}`);
  }
}
```

MOCK_PLC=true 时不论 protocol 一律返回 MockPlcWriter,便于无硬件开发。

### 4.4 sqlite-service 方法

```ts
setDispatchPending(id: number): void {
  this.db.prepare(`
    UPDATE ai_suggestions SET dispatch_status='pending_dispatch'
    WHERE id=? AND suggestion_type='widget_button' AND source_module='scada'
  `).run(id);
}

claimPendingDispatches(limit: number): any[] {
  // SQLite 不支持 UPDATE...RETURNING 在所有版本;用 BEGIN+SELECT+UPDATE+SELECT
  return this.db.transaction(() => {
    const rows = this.db.prepare(`
      SELECT * FROM ai_suggestions
      WHERE dispatch_status='pending_dispatch' ORDER BY id LIMIT ?
    `).all(limit);
    if (rows.length === 0) return [];
    const ids = rows.map((r: any) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(`UPDATE ai_suggestions SET dispatch_status='dispatching' WHERE id IN (${placeholders})`).run(...ids);
    return rows;
  })();
}

markDispatched(id: number): void {
  this.db.prepare(`
    UPDATE ai_suggestions SET dispatch_status='dispatched', dispatched_at=datetime('now'), dispatch_error=NULL
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

## 5. 客户端集成 (轻)

### 5.1 ScadaSuggestion 类型扩展

`packages/web-ui/src/api/scada.ts`:
```ts
export interface ScadaSuggestion {
  // ... 现有字段
  dispatch_status: 'pending_dispatch' | 'dispatching' | 'dispatched' | 'failed' | null;
  dispatch_retry_count?: number;
  dispatched_at?: string | null;
  dispatch_error?: string | null;
}
```

### 5.2 SuggestionRow 徽章

`SuggestionRow.tsx` 头部右侧追加:
```tsx
{suggestion.dispatch_status && (
  <span className={`text-xs px-2 py-0.5 rounded ${dispatchBadgeClass(suggestion.dispatch_status)}`}>
    {dispatchLabel(suggestion.dispatch_status)}
  </span>
)}
```

| status | label | 颜色 |
|---|---|---|
| `pending_dispatch` | 待下发 | yellow-100 / yellow-700 |
| `dispatching` | 下发中 | blue-100 / blue-700 |
| `dispatched` | 已下发 | green-100 / green-700 |
| `failed` | 下发失败 | red-100 / red-700 |

failed 行 hover 显示 `dispatch_error` (title 属性即可)。

### 5.3 realtime-store 处理 dispatched / dispatch_failed

`case 'ai_suggestion'` dispatcher 已 spread payload。当 `action='dispatched'` 或 `'dispatch_failed'` 到达,review 页的 `useScadaSuggestions` hook 已 debounced refetch (500ms),自动反映新 dispatch_status。无需新 store 状态。

Toast (现 ScadaToast) 处理 `action='created'`,本子项目不动 toast 行为;`dispatched` 不另弹 toast (avoid spam)。`dispatch_failed` 可选弹红色 toast (P2,本子项目不实现,操作员在 review 页徽章看到失败即可)。

## 6. 不做的事

- 控制 controller 用本 dispatcher (controller 自己有 plcWrite 路径,本子项目仅服务 SCADA widget 手动写)
- 写完后回读校验 (P2,操作员从 ProcessValues 读到新值反馈即可)
- 异步任务队列基础设施 (BullMQ/redis 等);本子项目用 SQLite + setInterval 已够,延迟容忍 500ms
- 多 dispatcher 实例 / 分布式锁 (server 单实例)
- Engine PLC 写动态启停 UI (启动配置 env + restart)
- 实时 dispatch_status 单条 patch (依靠 debounced refetch 已够)
- 操作员 retry 按钮 (manual re-accept 即可触发新下发循环)

## 7. 风险

| 风险 | 缓解 |
|---|---|
| daemon 崩溃 → pending_dispatch 累积 | server 重启后 startup 调 rollbackInProgressDispatches + dispatcher 续上 |
| S7 库 native binding 缺 | MOCK_PLC=true 兜底;writerFactory 抛清晰错误 |
| 操作员 accept 后 PLC 物理离线 → 重试 3 次失败 | failed 入审计 + 徽章告知;操作员可重新触发 widget click |
| target_param 找不到 mapping | 永久失败,不重试;徽章 + audit error msg |
| 多 accept 同时打 → 并发 claim | SQLite transaction 内 claim 原子;一行只可能被一个 tick 拿到 |
| dispatch_status='dispatching' 期间 server kill | startup rollback 回 pending |
| 操作员 reject 已 dispatched 的行 | reject handler 不动 dispatch_status (已下发不可撤);UI 已下发行 hide [拒绝] 按钮 |
| MOCK_PLC 在生产被误开 | 沿用现有 banner 启动警告;部署 checklist 已含 MOCK_PLC=false 项 |

## 8. 验收 (DoD)

- 14 vitest cases 全绿
- TS 编译 0 新错误
- migration 029 在干净 DB 上 apply 后 schema 正确
- 浏览器 DoD (MOCK_PLC=true):
  1. login admin → /scada/demo_v1 → 点 button widget → reason "下发 DoD" → 提交
  2. /scada/suggestions → 见新行 (徽章: 无 / 或 NULL — 因尚未 accept)
  3. 点 [接受] → 行短暂消失再回 (refetch) → 徽章 "待下发" → 500ms 内 → "已下发"
  4. 重启 server (kill + npm run dev, 保持 MOCK_PLC) → dispatched 行保留;若有未处理 pending → 续完
  5. 临时关掉 mapping (改 plc_variable_mappings.direction='read'), accept 新行 → 立即 "下发失败"
  6. audit_log 包含 `ai_suggestion_dispatched` + `ai_suggestion_dispatch_failed` 行
  7. 0 console errors

---

## 9. 实施顺序 (~12 任务)

1. migration 029 + sqlite-service 5 个方法 + 4 测试
2. PlcWriter interface + MockPlcWriter + 1 测试
3. S7PlcWriter (dynamic load, MOCK_PLC fallback) + 1 测试 (mock S7Client)
4. ModbusPlcWriter skeleton + 1 测试 (mock modbus-serial) — **若硬件未到, skeleton 抛 NOT_IMPLEMENTED 即可, 后续 hotfix**
5. createPlcWriter 工厂 + 路由分发
6. scada-write-dispatcher claimPending / dispatchOne / DispatchError + 4 测试
7. dispatcher 生命周期 (startup + stop) + rollback + 1 测试
8. accept handler 改: setDispatchPending + 1 测试 (HTTP 集成)
9. ScadaSuggestion 类型加 dispatch_* 字段 + SuggestionRow 徽章 + 1 测试
10. realtime-store ai_suggestion action='dispatched'/'dispatch_failed' (无需新逻辑, 验证 debounced refetch 工作)
11. 全套测试 + TS 全包检查
12. 浏览器 DoD (MOCK_PLC=true) + 最终代码 review + 标记 spec Done

(writing-plans 阶段定 final 顺序)

---

**子项目完成后**: SCADA write-intent 端到端闭环。后续 P2 (本设计外): dispatch_failed 红色 toast、操作员手动 retry 按钮、写后回读校验、controller plcWrite stub 填实。
