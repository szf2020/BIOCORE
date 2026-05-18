# BIOCore API Rate Limiting

**版本**: SP-FX-40  
**生效**: 2026-05-18

---

## 概述

BIOCore server 通过 in-memory 固定窗口计数器实现 API 速率限制，防止 DoS、brute-force 和写入轰炸攻击。零第三方依赖，单实例部署足够。

---

## 默认全局限制

| 参数 | 值 |
|------|-----|
| 时间窗口 | 60 秒 |
| 最大请求数 | 100 req/min per IP |
| Key 策略 | `ip`（按来源 IP 计数） |
| 豁免路径 | `/health`, `/liveness`, `/metrics`, `/api/v1/metrics` |

全局限制在 cors/JSON body 解析之后、auth 认证之前生效。

---

## Per-Route 严格限制

| Endpoint | 方法 | 限制 | Key 策略 | 说明 |
|----------|------|------|----------|------|
| `/api/v1/auth/login` | POST | 5 req/min | `ip:path` | 防 brute-force 暴力破解 |
| `/api/v1/scada/write-intents` | POST | 30 req/min | `ip:path` | 防写入轰炸（PLC 安全连锁保护） |
| `/api/v1/admin/backup` | POST | 1 req/min | `ip:path` | 防 backup I/O 耗尽 |

Per-route 限制独立于全局限制。同一 IP 在触发 per-route 限制前，全局限制通常先到达。

---

## 响应格式

超出限制时返回 HTTP 429：

```
HTTP/1.1 429 Too Many Requests
Retry-After: 42
Content-Type: application/json

{
  "error": "Too many requests",
  "retryAfter": 42
}
```

`retryAfter` 单位为秒，表示距当前窗口结束的剩余时间。

---

## Per-Route Override 配置示例

在 route 文件中导入并使用：

```typescript
import { rateLimit } from './middlewares/rate-limit';

// 自定义限制：30 req/min，按 ip:path 独立计数
const myRateLimit = rateLimit({ limit: 30, windowMs: 60_000, keyStrategy: 'ip:path' });

apiRouter.post('/my/endpoint', myRateLimit, handler);
```

---

## 算法说明

**固定窗口计数器 (Fixed Window Counter)**:

- 每个 key 维护 `{ count, resetAt }` 记录
- 首次请求创建窗口，`resetAt = now + windowMs`
- 窗口内计数 +1；达到 `limit` 后拒绝
- `resetAt` 过期后窗口自动重置

**清理**: 每 5 分钟 prune 过期 entry，防止内存泄漏。

**边界注意**: 固定窗口在窗口边界处最坏情况允许 2x burst（两个连续窗口各满），可接受于单实例 BIOCore 场景。

---

## 升级建议：Redis-backed 多实例部署

当 BIOCore 扩展为多实例（横向扩展或蓝绿部署）时，in-memory Map 无法跨实例共享状态。升级步骤：

1. **引入 Redis 依赖**（如 `ioredis`）
2. **替换 storage adapter**：
   - 当前: `Map<string, {count, resetAt}>`
   - 目标: Redis `INCR` + `EXPIREAT` 原子操作
3. **接口不变**：`rateLimit(config)` 签名保持，调用方零改动
4. **环境变量**: 添加 `REDIS_URL=redis://host:6379`

Redis 方案提供精确滑动窗口（Lua 脚本原子性），可消除边界 burst 问题。

---

## 安全考量

- rate-limit 在 auth 之前执行：被拒绝的请求不产生 audit log，减少噪音
- login 的 5 req/min 限制有效防止密码暴力枚举
- write-intents 限制保护 PLC 安全连锁，符合 BIOCore 安全 invariant（AI 建议缓冲区入口）
- 考虑在 Nginx 层面补充 IP 黑名单能力，与 server 端限制形成纵深防御
