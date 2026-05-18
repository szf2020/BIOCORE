# SP-FX-44 — PWA / Offline Support 执行计划

**日期**: 2026-05-18
**Sprint**: SP-FX-44
**参考规范**: `specs/2026-05-18-fuxa-scada-sp-fx-44-pwa-offline-design.md`

---

## 任务列表

### T1: PWA manifest + icons
- 新建 `packages/web-ui/public/manifest.webmanifest`
- 新建 `packages/web-ui/public/icons/icon-192.png` (placeholder SVG-embedded PNG)
- 新建 `packages/web-ui/public/icons/icon-512.png`
- 验证: `cat manifest.webmanifest` 含必要字段

### T2: Service Worker (sw.js)
- 新建 `packages/web-ui/public/sw.js`
- 实现 install / activate / fetch / message 事件处理
- Cache 策略: cache-first (静态) / network-first 5s (API GET) / network-only (POST/auth/admin)
- offline fallback: navigate 失败 → `/offline`
- 验证: sw.js 语法正确 (node --check)

### T3: SW 单测 (RED → GREEN)
- 新建 `packages/web-ui/src/__tests__/sw.test.ts`
- mock: globalThis.caches, globalThis.fetch, clients.claim, skipWaiting
- 8-10 tests: 策略路由、POST 不 cache、auth 不 cache、offline fallback、SKIP_WAITING
- 验证: vitest --run 全绿

### T4: useServiceWorker hook
- 新建 `packages/web-ui/src/hooks/useServiceWorker.ts`
- 注册 SW + 检测 waiting → updateReady state
- 3 tests: 注册、update 检测、skipWaiting 消息

### T5: Offline page
- 新建 `packages/web-ui/src/app/offline/page.tsx`
- 显示离线图标、标题、重试按钮、缓存 view 列表
- 3-4 tests

### T6: InstallPrompt component
- 新建 `packages/web-ui/src/components/layout/InstallPrompt.tsx`
- beforeinstallprompt 监听 + localStorage dismissed
- 4 tests

### T7: layout.tsx + next.config.js 集成
- layout.tsx: 加 `<link rel="manifest">` + `<InstallPrompt />`
- next.config.js: 加 SW / manifest 缓存 headers
- 验证: tsc 无错误

### T8: docs/pwa.md
- 新建 `docs/pwa.md`
- 内容: 启用条件、offline 行为、Chrome DevTools 调试 SOP

---

## 成功标准

- vitest: 基线 1157 + 新增 18-21 tests >= 1175
- tsc --noEmit 零错误
- sw.js 不 cache: auth endpoints / POST / admin
- manifest.webmanifest 含 192 + 512 icons
- offline page 路由 `/offline` 存在

---

## 依赖关系

```
T1 ─┐
T2 ─┼─→ T3
    └─→ T4 → T7
T5  ─→ T7
T6  ─→ T7
T8  (独立)
```
