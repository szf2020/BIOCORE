# SP-FX-23 实施计划: PLC 真实接入 (snap7-real)

**日期**: 2026-05-18  
**Sprint**: SP-FX-23  
**范围**: `packages/plc-driver/*` only

---

## 任务列表

### Task 1: MockPlcClient 实现 (TDD RED-first)

**文件**: `packages/plc-driver/src/__tests__/snap7-real.test.ts` (新建)  
**步骤**:
1. 写 test 1+2 (MockPlcClient read/write roundtrip) → RED
2. 在 `packages/plc-driver/src/index.ts` 实现 `MockPlcClient` class → GREEN
3. 验证: `pnpm --filter @biocore/plc-driver test`

**验收**: test 1+2 通过

---

### Task 2: 工厂函数 createPlcDriver (TDD RED-first)

**文件**: `packages/plc-driver/src/__tests__/snap7-real.test.ts`, `packages/plc-driver/src/index.ts`  
**步骤**:
1. 写 test 3 (createPlcDriver MOCK_PLC=true → MockPlcClient) → RED
2. 扩展 `PLCConnectionManager` constructor 加 `adapter?` 参数
3. 实现 `createPlcDriver(config)` 工厂函数
4. 导出 `createPlcDriver` → GREEN

**验收**: test 3 通过

---

### Task 3: writeTag confirmed gate (TDD RED-first)

**文件**: `packages/plc-driver/src/__tests__/snap7-real.test.ts`, `packages/plc-driver/src/index.ts`  
**步骤**:
1. 写 test 4+5 (missing confirmed throws / confirmed=true passes) → RED
2. 修改 `PLCConnectionManager.writeTag` 签名: 加 `opts?: { confirmed?: boolean }`
3. 前置 gate 检查 → GREEN

**验收**: test 4+5 通过; writeTag gate 严格

---

### Task 4: Reconnect backoff max 5 次 (TDD RED-first)

**文件**: `packages/plc-driver/src/__tests__/snap7-real.test.ts`, `packages/plc-driver/src/index.ts`  
**步骤**:
1. 写 test 6 (reconnect 超限 emit max_reconnect_exceeded) → RED
2. 重写 `PLCConnectionManager.tryReconnect`:
   - 计数 attempt (0-based)
   - 指数 delay: `Math.min(1000 * 2^attempt, 30000)`
   - attempt >= 5 → emit `max_reconnect_exceeded` + stop
3. GREEN

**验收**: test 6 通过; 现有 reconnect-handles-leak test 仍通过

---

### Task 5: readTag error → null + reconnect (TDD RED-first)

**文件**: `packages/plc-driver/src/__tests__/snap7-real.test.ts`, `packages/plc-driver/src/index.ts`  
**步骤**:
1. 写 test 7 (readTag error returns null + triggers reconnect) → RED
2. 修改 `readTag` 返回 `Promise<number | null>`, catch → return null + tryReconnect()
3. GREEN

**验收**: test 7 通过

---

### Task 6: .env.example + README 更新

**文件**: `.env.example`, `packages/plc-driver/README.md`  
**步骤**:
1. `.env.example`: 更新 MOCK_PLC 注释, 确认 PLC_IP/PLC_RACK/PLC_SLOT 存在
2. `packages/plc-driver/README.md`: 更新 real 模式 setup 说明

**验收**: env 文件有 MOCK_PLC/PLC_IP/PLC_RACK/PLC_SLOT 说明

---

### Task 7: 全量测试 + push

**步骤**:
1. `pnpm --filter @biocore/plc-driver test` → 72+ tests pass
2. `pnpm --filter @biocore/server test` → 152 tests (不减)
3. `pnpm --filter @biocore/web-ui test` → 1036 tests (不减)
4. `git pull --rebase origin main`
5. `git push origin main`

**验收**: 全部通过, push 成功

---

## 时序

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7
 (Mock)   (factory)  (gate)  (backoff)  (null)   (docs)   (push)
```

每个 Task 独立 commit.
