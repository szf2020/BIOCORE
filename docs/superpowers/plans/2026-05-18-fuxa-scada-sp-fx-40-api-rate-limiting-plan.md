# SP-FX-40 API Rate Limiting — 实施计划

**日期**: 2026-05-18  
**Sprint**: SP-FX-40  
**参考 Spec**: `docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-40-api-rate-limiting-design.md`

---

## 任务列表

### T1: [RED] 新建测试文件 rate-limit.test.ts（8 个测试，全部 RED）
- 新增 `packages/server/src/__tests__/rate-limit.test.ts`
- 测试 T1-T8（见 spec 10 节）
- 验证: `pnpm --filter @biocore/server test rate-limit` 报错（模块不存在）

### T2: [GREEN] 实现 rate-limit.ts middleware
- 新增 `packages/server/src/middlewares/rate-limit.ts`
- 固定窗口计数器, Map<key, {count, resetAt}>
- `rateLimit(config?)` 工厂函数
- `stopCleanup()` 导出（测试用）
- setInterval 5 分钟 prune
- 429 body: `{ error: 'Too many requests', retryAfter: <seconds> }`
- Retry-After header
- 验证: 8 个测试全绿

### T3: 注册全局 rate-limit 到 server/index.ts
- 在 index.ts 末尾 append import + app.use(rateLimit(...))
- skipPaths: ['/health', '/liveness', '/metrics', '/api/v1/metrics']
- 验证: tsc + vitest 221+ 绿

### T4: Per-route override — login / write-intents / backup
- auth-routes.ts: login 前加 rateLimit({limit:5, keyStrategy:'ip:path'})
- scada-routes.ts: write-intents 前加 rateLimit({limit:30, keyStrategy:'ip:path'})
- backup-routes.ts: /admin/backup 前加 rateLimit({limit:1, keyStrategy:'ip:path'})
- 验证: tsc 无错

### T5: 新增 docs/security-rate-limit.md
- 默认 limit 清单 + per-route override 清单
- Redis-backed 升级建议
- 验证: 文件存在

### T6: 全量验证 + push
- pnpm --filter @biocore/server test → 226+ 绿
- pnpm tsc --noEmit
- git pull --rebase origin main
- git push origin main

---

## 成功标准

- [ ] 8 个 rate-limit 测试全绿
- [ ] server 总 vitest 226+ (baseline 221 + 5-8 新增)
- [ ] tsc --noEmit 无错
- [ ] 全局 100 req/min + 3 per-route override 已注册
- [ ] docs/security-rate-limit.md 存在
- [ ] push 成功
