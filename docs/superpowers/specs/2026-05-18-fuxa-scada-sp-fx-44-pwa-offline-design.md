# SP-FX-44 — PWA / Offline Support 设计规范

**日期**: 2026-05-18
**Sprint**: SP-FX-44
**作者**: 自治 agent

---

## 1. 背景与目标

BIOCore web-ui (Next.js 14) 目前无 PWA 支持。SCADA 操作员现场网络不稳，需：
- Service Worker cache 静态资源（assets / icons）
- Offline fallback page（显示离线提示 + 缓存 view 列表）
- Install prompt（Add to Home Screen banner）
- Update notification（检测新 SW 版本 → toast 提示）

**零第三方依赖**: 不引入 workbox / next-pwa。纯 Vanilla SW + 原生 API。

---

## 2. 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `packages/web-ui/public/manifest.webmanifest` | 新建 | PWA manifest |
| `packages/web-ui/public/sw.js` | 新建 | Service Worker (JS，public/ 内无编译步骤) |
| `packages/web-ui/src/app/offline/page.tsx` | 新建 | 离线 fallback 页 |
| `packages/web-ui/src/components/layout/InstallPrompt.tsx` | 新建 | 安装提示 banner |
| `packages/web-ui/src/hooks/useServiceWorker.ts` | 新建 | SW 注册 + update 检测 hook |
| `packages/web-ui/src/app/layout.tsx` | 修改 | 加 manifest link + SW 注册组件 |
| `packages/web-ui/next.config.js` | 修改 | 加 SW / manifest HTTP 头 |
| 各 `__tests__/` 文件 | 新建 | vitest 单测 |
| `docs/pwa.md` | 新建 | PWA 使用与调试文档 |

**不触碰**: server / data-service / plc-driver / migrations / dict files

---

## 3. Manifest 设计

```json
{
  "name": "BIOCore MES 发酵控制平台",
  "short_name": "BIOCore",
  "description": "实验室R&D发酵智能控制系统",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0F766E",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Icons: 生成 placeholder PNG（深色背景 + "BC" 文字）via SVG base64 嵌入。
实际项目可替换为真实 logo。

---

## 4. Service Worker Cache 策略

| URL 模式 | 策略 | TTL / 超时 | 说明 |
|---------|------|-----------|------|
| `/_next/static/**` | Cache-First | 24h | JS/CSS chunk，hash 唯一不过期 |
| `/icons/**`, `/scada-shapes/**` | Cache-First | 24h | 静态图标 |
| `*.js, *.css, *.woff2, *.png, *.svg` (static ext) | Cache-First | 24h | 其他静态资源 |
| `GET /api/v1/scada/views*` | Network-First | 5s timeout | 离线时 fallback cache |
| `GET /api/v1/scada/projects*` | Network-First | 5s timeout | 离线时 fallback cache |
| `POST /api/**`, `PUT /api/**`, `DELETE /api/**` | Network-Only | — | 写操作不 cache |
| `/api/v1/auth/**`, `/admin/**` | Network-Only | — | 安全 — 不 cache |
| navigate (HTML document) | Network-First | — | 失败时 → `/offline` |

**安全排除清单** (SW 不 cache):
- `/api/v1/auth/*` — 认证 token
- `/admin/*` — 管理员操作
- `write-intent` 相关 POST — WriteIntent 操作
- 所有 `method !== 'GET'` 请求

---

## 5. SW 生命周期

```
install   → 预 cache offline fallback HTML
activate  → 清旧 cache（版本号控制）
fetch     → 按策略路由
message   → 接收 SKIP_WAITING 指令（用于热更新）
```

Cache 名称:
- `biocore-static-v1` — 静态资源
- `biocore-api-v1` — API GET 缓存
- `biocore-offline-v1` — offline fallback

---

## 6. Offline Page 设计

路由: `/offline`
内容:
- 离线图标 + "您当前处于离线状态" 标题
- "请检查网络连接后重试" 副标题
- 重试按钮（`window.location.reload()`）
- 缓存的最近 view 列表（从 localStorage 读 `biocore_cached_views`）

---

## 7. InstallPrompt 设计

- 监听 `beforeinstallprompt` 事件
- 显示固定底部 banner: "安装 BIOCore 到主屏幕"
- 按钮: [安装] [稍后]
- localStorage key: `biocore_install_dismissed`（dismissed = 不再提示）
- SSR guard: `typeof window === 'undefined'` 检查

---

## 8. Update Notification 设计

- `useServiceWorker` hook: 检测 SW `waiting` 状态
- 显示 toast: "新版本可用" + [立即刷新] 按钮
- 点击 → postMessage `{ type: 'SKIP_WAITING' }` → `window.location.reload()`
- Toast 实现: 简单 fixed 定位 div（不引新依赖）

---

## 9. 测试计划

| 文件 | 测试数 | 重点 |
|------|--------|------|
| `sw.test.ts` | 8-10 | mock fetch + caches API: 策略路由、网络失败 fallback、POST 不 cache |
| `offline/page.test.tsx` | 3-4 | 渲染、重试按钮、缓存 view 列表 |
| `InstallPrompt.test.tsx` | 4 | 事件监听、显示/隐藏、dismissed 状态、安装触发 |
| `useServiceWorker.test.ts` | 3 | 注册、update 检测、SKIP_WAITING |

---

## 10. 安全约束

- WriteIntent POST 走 Network-Only → SW 无法绕过
- offline 状态下 write-tag 操作会网络失败 → 上层 UI 显示错误，不会 fallback 到 cache
- SW 不持久化任何认证 token

---

## 11. 与并行 sprint 的隔离

- 只改 web-ui/public/ + 新 page + InstallPrompt + layout.tsx
- SP-FX-42/43/45/46 不触碰这些文件
- layout.tsx 改动: 仅追加 `<link rel="manifest">` 和 `<InstallPrompt />`
