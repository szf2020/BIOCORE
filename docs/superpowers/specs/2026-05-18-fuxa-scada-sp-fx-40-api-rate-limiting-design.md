# SP-FX-40 API Rate Limiting — 设计文档

**日期**: 2026-05-18  
**Sprint**: SP-FX-40  
**作者**: autonomous agent

---

## 1. 背景

BIOCore server 当前无任何速率限制，面临以下风险：
- DoS 攻击（高频请求耗尽资源）
- brute-force 暴力破解 `/auth/login`
- SCADA 写入轰炸（写死 PLC 安全连锁）
- backup 触发轰炸（I/O 耗尽）

## 2. 范围

| 文件 | 操作 |
|------|------|
| `packages/server/src/middlewares/rate-limit.ts` | 新增 |
| `packages/server/src/__tests__/rate-limit.test.ts` | 新增 |
| `packages/server/src/index.ts` | 末尾 append（全局注册 + 3 个 inline） |
| `docs/security-rate-limit.md` | 新增 |

**不触碰**: widget / web-ui / data-service / plc-driver / migrations / nginx / grafana / 现有 routes（除 inline rate-limit 行）。

## 3. 算法选择

### 固定窗口计数器 (Fixed Window Counter)

**选择理由**: 零依赖、实现 ~50 行、Map 存储 O(1)、满足"1 分钟重置"语义。

**与替代方案对比**:
| 方案 | 精度 | 内存 | 复杂度 | 选择 |
|------|------|------|--------|------|
| 固定窗口计数 | 中 | O(clients) | 低 | 选用 |
| 滑动日志 | 高 | O(clients×req) | 中 | 内存开销大，不选 |
| Token Bucket | 高 | O(clients) | 高 | 过度设计，不选 |

**已知局限**: 窗口边界处理最坏情况 2× burst（acceptable for BIOCore 单实例场景）。

## 4. 数据结构

```typescript
interface RateLimitEntry {
  count: number;
  resetAt: number; // unix ms
}

// 存储: Map<key, RateLimitEntry>
// key = `${ip}` 或 `${ip}:${path}` (由 keyStrategy 决定)
```

## 5. 配置接口

```typescript
interface RateLimitConfig {
  /** 时间窗口 ms，默认 60_000 (1分钟) */
  windowMs?: number;
  /** 窗口内最大请求数，默认 100 */
  limit?: number;
  /** key 策略: 'ip' | 'ip:path'，默认 'ip' */
  keyStrategy?: 'ip' | 'ip:path';
  /** 跳过 rate-limit 的路径前缀，如 ['/health', '/metrics'] */
  skipPaths?: string[];
}
```

## 6. Middleware 函数签名

```typescript
// 工厂函数，返回 Express RequestHandler
export function rateLimit(config?: RateLimitConfig): RequestHandler
```

## 7. 全局 + Per-Route 配置

### 全局默认（index.ts 末尾 append）

```typescript
import { rateLimit } from './middlewares/rate-limit';
app.use(rateLimit({ windowMs: 60_000, limit: 100, skipPaths: ['/health', '/liveness', '/metrics'] }));
```

顺序: cors → json → traceMw → **rateLimit(全局)** → metrics → v1ResponseWrapper → authMiddleware → apiRouter

### Per-Route Override（inline, 在各 route handler 前）

| Route | Limit | 位置 |
|-------|-------|------|
| `POST /auth/login` | 5 req/min | auth-routes.ts 的 router.post('/auth/login', ...) 前加 inline middleware |
| `POST /scada/write-intents` | 30 req/min | scada-routes.ts 对应行前 |
| `POST /admin/backup` | 1 req/min | backup-routes.ts 对应行前 |

**Per-route 使用 `keyStrategy: 'ip:path'`** 以区分不同 endpoint 的计数器。

## 8. 429 响应格式

```json
{
  "error": "Too many requests",
  "retryAfter": 42
}
```

HTTP Headers:
```
HTTP/1.1 429 Too Many Requests
Retry-After: 42
Content-Type: application/json
```

`retryAfter` = `Math.ceil((resetAt - Date.now()) / 1000)` 秒。

## 9. Cleanup

`setInterval` 每 5 分钟 prune 已过期的 entry（`resetAt < Date.now()`）。

cleanup interval 在测试中必须可关闭，避免 vitest 报 "open handles"。模块导出 `stopCleanup()` 函数。

## 10. 测试计划（8 个）

| # | 测试 | 验证点 |
|---|------|--------|
| T1 | 低于 limit → 200 | 正常请求通过 |
| T2 | 超 limit → 429 | 第 limit+1 请求被拒 |
| T3 | 不同 IP → 独立计数 | IP A 不影响 IP B |
| T4 | 不同 path + ip:path 策略 → 独立计数 | path 区分 |
| T5 | 窗口重置后恢复 → 200 | resetAt 过期后重新计数 |
| T6 | cleanup prune → Map 清理 | expired entry 被移除 |
| T7 | skipPaths → 跳过 | health/metrics 不计数 |
| T8 | 429 body + Retry-After header 格式 | error/retryAfter 字段正确 |

## 11. 安全 invariant

- rate-limit 运行在 authMiddleware **之前**（拒绝 → 不消耗 auth 资源，不产生 audit log）
- AI 建议缓冲区路径不受影响（仅保护对外 API）
- animation-engine T8: rate-limit 不写入 PLC，无 side effect

## 12. 多实例升级路径

当前: 单实例 in-memory Map（足够 Phase 1 MVP）。  
未来: 替换为 Redis-backed 实现只需换 storage adapter，接口不变。详见 `docs/security-rate-limit.md`。
