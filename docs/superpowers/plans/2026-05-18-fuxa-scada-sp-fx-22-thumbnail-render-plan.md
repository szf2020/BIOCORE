# SP-FX-22 Thumbnail 高级渲染 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ViewCard 的 thumbnail 从 400 字符截断升级为真实 SVG mini-preview，含防御性 sanitize。

**Architecture:** 新建独立 `ThumbnailRenderer` 组件，接收完整 svgcontent，用 regex sanitize 去除 script/on* 后，通过 `dangerouslySetInnerHTML` 注入外层 `<svg viewBox>` 实现等比缩放；ViewCard 替换旧实现直接调用该组件。

**Tech Stack:** React + TypeScript + Vitest + Testing Library + Playwright

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `packages/web-ui/src/components/scada/pages/ThumbnailRenderer.tsx` | 新建 | SVG mini-preview 渲染 + sanitize |
| `packages/web-ui/src/components/scada/pages/__tests__/ThumbnailRenderer.test.tsx` | 新建 | ThumbnailRenderer 单元测试 (8 个) |
| `packages/web-ui/src/components/scada/pages/ViewCard.tsx` | 修改 | 替换 thumbnail 区域为 ThumbnailRenderer |
| `packages/web-ui/e2e/scada-thumbnail.spec.ts` | 新建 | PW E2E：cards-view thumbnail SVG 存在验证 |

---

### Task 1: ThumbnailRenderer 单元测试 (RED)

**Files:**
- Create: `packages/web-ui/src/components/scada/pages/__tests__/ThumbnailRenderer.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `packages/web-ui/src/components/scada/pages/__tests__/ThumbnailRenderer.test.tsx` 创建内容：

```tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThumbnailRenderer } from '../ThumbnailRenderer';

describe('ThumbnailRenderer', () => {
  it('1. 空 svgcontent 时渲染空 SVG（不崩溃）', () => {
    render(<ThumbnailRenderer svgcontent="" viewWidth={800} viewHeight={600} />);
    const svg = screen.getByTestId('thumbnail-svg');
    expect(svg).toBeTruthy();
  });

  it('2. 有 svgcontent 时渲染带 data-testid="thumbnail-svg" 的 SVG', () => {
    render(
      <ThumbnailRenderer svgcontent='<rect x="0" y="0" width="10" height="10"/>' viewWidth={800} viewHeight={600} />
    );
    expect(screen.getByTestId('thumbnail-svg')).toBeTruthy();
  });

  it('3. viewBox 正确拼接 viewWidth/viewHeight', () => {
    render(
      <ThumbnailRenderer svgcontent='<circle cx="5" cy="5" r="5"/>' viewWidth={1024} viewHeight={768} />
    );
    const svg = screen.getByTestId('thumbnail-svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1024 768');
  });

  it('4. sanitize: strip <script> tags', () => {
    const evil = '<script>alert(1)</script><rect x="0" y="0" width="10" height="10"/>';
    const { container } = render(
      <ThumbnailRenderer svgcontent={evil} viewWidth={800} viewHeight={600} />
    );
    expect(container.innerHTML).not.toContain('<script');
    expect(container.innerHTML).not.toContain('alert(1)');
  });

  it('5. sanitize: strip on* 事件属性', () => {
    const evil = '<rect onclick="evil()" onmouseover="bad()" x="0" y="0" width="10" height="10"/>';
    const { container } = render(
      <ThumbnailRenderer svgcontent={evil} viewWidth={800} viewHeight={600} />
    );
    expect(container.innerHTML).not.toContain('onclick');
    expect(container.innerHTML).not.toContain('onmouseover');
  });

  it('6. 合法元素内容保留注入到 SVG 内部', () => {
    const safe = '<rect x="0" y="0" width="100" height="50" fill="red"/>';
    const { container } = render(
      <ThumbnailRenderer svgcontent={safe} viewWidth={800} viewHeight={600} />
    );
    expect(container.querySelector('rect')).toBeTruthy();
  });

  it('7. 默认 height=80 应用到 SVG 元素', () => {
    render(<ThumbnailRenderer svgcontent="" viewWidth={800} viewHeight={600} />);
    const svg = screen.getByTestId('thumbnail-svg');
    expect(svg.getAttribute('height')).toBe('80');
  });

  it('8. preserveAspectRatio="xMidYMid meet" 属性存在', () => {
    render(<ThumbnailRenderer svgcontent="" viewWidth={800} viewHeight={600} />);
    const svg = screen.getByTestId('thumbnail-svg');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });
});
```

- [ ] **Step 2: 运行测试，确认 RED**

```bash
cd /Users/mac/biocore-sp-fx-17
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm -F web-ui exec vitest run src/components/scada/pages/__tests__/ThumbnailRenderer.test.tsx --reporter=verbose 2>&1 | tail -20
```

期望：FAIL — `Cannot find module '../ThumbnailRenderer'`

- [ ] **Step 3: Commit 测试文件**

```bash
cd /Users/mac/biocore-sp-fx-17
git add packages/web-ui/src/components/scada/pages/__tests__/ThumbnailRenderer.test.tsx
git commit -m "test(sp-fx-22): ThumbnailRenderer 单元测试 RED"
```

---

### Task 2: ThumbnailRenderer 实现 (GREEN)

**Files:**
- Create: `packages/web-ui/src/components/scada/pages/ThumbnailRenderer.tsx`

- [ ] **Step 1: 创建组件实现**

在 `packages/web-ui/src/components/scada/pages/ThumbnailRenderer.tsx` 创建：

```tsx
'use client';
import React from 'react';

interface ThumbnailRendererProps {
  svgcontent: string;
  width?: number;
  height?: number;
  viewWidth: number;
  viewHeight: number;
}

/** 防御性 sanitize：去除 script tags 和 on* 事件属性 */
function sanitizeSvg(raw: string): string {
  // strip <script ...>...</script> (含多行, 大小写不敏感)
  let result = raw.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // strip on* 事件属性，如 onclick="..." onmouseover='...'
  result = result.replace(/\s+on\w+=(["'])[^"']*\1/gi, '');
  return result;
}

export function ThumbnailRenderer({
  svgcontent,
  height = 80,
  viewWidth,
  viewHeight,
}: ThumbnailRendererProps) {
  const safe = sanitizeSvg(svgcontent);

  return (
    <svg
      data-testid="thumbnail-svg"
      width="100%"
      height={height}
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ pointerEvents: 'none', display: 'block' }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
```

- [ ] **Step 2: 运行测试，确认 GREEN**

```bash
cd /Users/mac/biocore-sp-fx-17
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm -F web-ui exec vitest run src/components/scada/pages/__tests__/ThumbnailRenderer.test.tsx --reporter=verbose 2>&1 | tail -25
```

期望：8 passed

- [ ] **Step 3: Commit**

```bash
cd /Users/mac/biocore-sp-fx-17
git add packages/web-ui/src/components/scada/pages/ThumbnailRenderer.tsx
git commit -m "feat(sp-fx-22): ThumbnailRenderer 组件 — 真实 SVG preview + sanitize"
```

---

### Task 3: ViewCard 替换 thumbnail 实现

**Files:**
- Modify: `packages/web-ui/src/components/scada/pages/ViewCard.tsx`

- [ ] **Step 1: 添加 ThumbnailRenderer import**

用 Edit 工具，在 ViewCard.tsx 第 4 行后插入 import：

将：
```tsx
import type { ViewMeta } from '@/hooks/useViewList';
```
替换为：
```tsx
import type { ViewMeta } from '@/hooks/useViewList';
import { ThumbnailRenderer } from './ThumbnailRenderer';
```

- [ ] **Step 2: 删除 svgSnippet 行**

将：
```tsx
  const hasSvg = typeof view.svgcontent === 'string' && view.svgcontent.trim().length > 0;
  const svgSnippet = hasSvg ? view.svgcontent!.slice(0, 400) : '';
```
替换为：
```tsx
  const hasSvg = typeof view.svgcontent === 'string' && view.svgcontent.trim().length > 0;
```

- [ ] **Step 3: 替换 thumbnail 渲染区域**

将：
```tsx
      {/* Thumbnail */}
      <div style={{ height: 80, background: '#f3f4f6', position: 'relative', overflow: 'hidden' }}>
        {hasSvg ? (
          <svg
            data-testid="view-card-thumbnail-svg"
            width="100%"
            height="80"
            viewBox="0 0 800 600"
            style={{ pointerEvents: 'none' }}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: svgSnippet }}
          />
        ) : (
```
替换为：
```tsx
      {/* Thumbnail */}
      <div style={{ height: 80, background: '#f3f4f6', position: 'relative', overflow: 'hidden' }}>
        {hasSvg ? (
          <div data-testid="view-card-thumbnail-svg">
            <ThumbnailRenderer
              svgcontent={view.svgcontent!}
              viewWidth={800}
              viewHeight={600}
              height={80}
            />
          </div>
        ) : (
```

- [ ] **Step 4: 运行 ViewCard 现有测试，确认不破**

```bash
cd /Users/mac/biocore-sp-fx-17
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm -F web-ui exec vitest run src/components/scada/pages/__tests__/ViewCard.test.tsx --reporter=verbose 2>&1 | tail -20
```

期望：7 passed（现有 7 个测试全部通过）

- [ ] **Step 5: 运行全量测试，确认基线不退**

```bash
cd /Users/mac/biocore-sp-fx-17
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm -F web-ui exec vitest run --reporter=verbose 2>&1 | tail -10
```

期望：≥1054 passed，0 failed

- [ ] **Step 6: Commit**

```bash
cd /Users/mac/biocore-sp-fx-17
git add packages/web-ui/src/components/scada/pages/ViewCard.tsx
git commit -m "feat(sp-fx-22): ViewCard thumbnail 替换为 ThumbnailRenderer"
```

---

### Task 4: TypeScript 类型检查

**Files:**
- No new files

- [ ] **Step 1: 运行 tsc**

```bash
cd /Users/mac/biocore-sp-fx-17
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm -F web-ui exec tsc --noEmit 2>&1 | head -30
```

期望：0 errors

- [ ] **Step 2: 如有错误，修复**

常见问题：
- `view.svgcontent` 为 `string | null | undefined` — 已有 `hasSvg` guard，传入时用 `!` non-null assertion 无误
- `height` 类型：ThumbnailRenderer `height?: number`，ViewCard 传 `80` (number) 无误

- [ ] **Step 3: Commit（若有修复）**

```bash
cd /Users/mac/biocore-sp-fx-17
git add -p
git commit -m "fix(sp-fx-22): tsc 类型修复"
```

---

### Task 5: Playwright E2E 测试

**Files:**
- Create: `packages/web-ui/e2e/scada-thumbnail.spec.ts`

- [ ] **Step 1: 创建 E2E 测试文件**

在 `packages/web-ui/e2e/scada-thumbnail.spec.ts` 创建：

```typescript
// SP-FX-22: Thumbnail 高级渲染 E2E
// Steps: login → /scada2 → seed view with svgcontent → assert thumbnail SVG exists + contains widget element

import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER ?? 'admin';
const ADMIN_PASS = process.env.E2E_PASS ?? 'admin123';
const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function getAuthToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  if (!r.ok()) throw new Error(`login failed: ${r.status()}`);
  return ((await r.json()).data.token) as string;
}

async function ensureProject(request: APIRequestContext, token: string): Promise<void> {
  await request.post(`${API_BASE}/api/v1/scada/projects`, {
    data: { project_id: 'default', name: 'Default' },
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function seedViewWithSvg(request: APIRequestContext): Promise<string> {
  const token = await getAuthToken(request);
  await ensureProject(request, token);
  const viewId = `v_thumb_e2e_${Date.now()}`;
  const svgcontent = '<rect x="10" y="10" width="200" height="100" fill="#3b82f6"/>';
  const r = await request.post(`${API_BASE}/api/v1/scada/projects/default/views`, {
    data: { view_id: viewId, name: `Thumb E2E ${Date.now()}`, svgcontent },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) {
    const text = await r.text();
    throw new Error(`seedViewWithSvg failed: ${r.status()} ${text}`);
  }
  return viewId;
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

test.describe('SP-FX-22: Thumbnail SVG 渲染', () => {
  test('cards-view thumbnail SVG element 存在且包含 widget 内部元素', async ({ page, request }) => {
    // 1. Seed 含 svgcontent 的 view
    await seedViewWithSvg(request);

    // 2. 登录并导航至 /scada2
    await login(page);
    await page.goto('/scada2');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !document.body.innerText.includes('加载中…'), { timeout: 10_000 }).catch(() => {});

    // 3. 确保 cards-view 模式
    const cardsModeBtn = page.getByTestId('view-mode-cards');
    await expect(cardsModeBtn).toBeVisible({ timeout: 8_000 });
    const isCardsActive = await cardsModeBtn.getAttribute('aria-pressed');
    if (isCardsActive !== 'true') {
      await cardsModeBtn.click();
    }

    // 4. 等待 view-card 出现
    const firstCard = page.getByTestId('view-card').first();
    await expect(firstCard).toBeVisible({ timeout: 8_000 });

    // 5. 验证 thumbnail wrapper div 存在
    const thumbnailWrapper = firstCard.getByTestId('view-card-thumbnail-svg');
    await expect(thumbnailWrapper).toBeVisible({ timeout: 5_000 });

    // 6. 验证内部 thumbnail-svg SVG element 存在（ThumbnailRenderer 渲染产物）
    const svgEl = thumbnailWrapper.locator('[data-testid="thumbnail-svg"]');
    await expect(svgEl).toBeVisible({ timeout: 5_000 });

    // 7. 验证 SVG 内部包含 rect widget 元素（真实渲染，非截断）
    const rectEl = svgEl.locator('rect').first();
    await expect(rectEl).toBeAttached({ timeout: 3_000 });
  });
});
```

- [ ] **Step 2: Commit E2E 文件**

```bash
cd /Users/mac/biocore-sp-fx-17
git add packages/web-ui/e2e/scada-thumbnail.spec.ts
git commit -m "test(sp-fx-22): Playwright E2E thumbnail SVG 渲染验证"
```

- [ ] **Step 3: 全量 vitest 最终确认**

```bash
cd /Users/mac/biocore-sp-fx-17
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm -F web-ui exec vitest run --reporter=verbose 2>&1 | tail -10
```

期望：≥1054 passed，0 failed

---

## 自检清单

### Spec 覆盖检查

| Spec 要求 | 覆盖 Task |
|-----------|-----------|
| ThumbnailRenderer 新组件 | Task 1 (test) + Task 2 (impl) |
| Props: svgcontent, width?, height?, viewWidth, viewHeight | Task 2 |
| svg viewBox="0 0 viewWidth viewHeight" | Task 1 test 3 + Task 2 |
| preserveAspectRatio="xMidYMid meet" | Task 1 test 8 + Task 2 |
| dangerouslySetInnerHTML 注入 | Task 2 |
| sanitize strip script tags | Task 1 test 4 + Task 2 sanitizeSvg() |
| sanitize strip on* 属性 | Task 1 test 5 + Task 2 sanitizeSvg() |
| ViewCard 替换 thumbnail | Task 3 |
| 现 ViewCard tests 不破 | Task 3 step 4 |
| PW E2E thumbnail SVG exists + widget | Task 5 |
| tsc 类型检查 | Task 4 |

### 类型一致性检查

- `ThumbnailRendererProps` 在 Task 2 定义，Task 3 调用传 `svgcontent`, `viewWidth={800}`, `viewHeight={600}`, `height={80}` — 全部匹配
- `sanitizeSvg(raw: string): string` 内部函数，不暴露 — 一致
- `data-testid="thumbnail-svg"` 在 Task 1 测试和 Task 2 实现中均一致
- `data-testid="view-card-thumbnail-svg"` 在 Task 3 中保留为外层 wrapper div，与 ViewCard.test.tsx 第 29 行 `getByTestId('view-card-thumbnail-svg')` 兼容
