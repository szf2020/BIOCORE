# SP-FX-25 移动端/触屏优化 — 设计规范

日期: 2026-05-18
Sprint: SP-FX-25

---

## Part 1: AppLayout Responsive

### 现状
- `AppLayout.tsx`: `nav` 固定 `w-[224px]`, 无折叠状态
- 小屏横向溢出

### 目标设计
- 新增 `sidebarOpen: boolean` state (默认 `false` on `< md`, `true` on `>= md`)
- `useEffect` 监听 `window.resize` 设置初始值
- Sidebar: `md:flex hidden` + `fixed inset-y-0 left-0 z-50` on mobile overlay 模式
- 汉堡按钮: `<button data-testid="hamburger-btn">` 在 header 左侧 `md:hidden` 显示
- Overlay backdrop `<div data-testid="sidebar-backdrop">` 点击关闭 sidebar
- 关闭按钮 `<button data-testid="close-sidebar-btn">` 在 sidebar 顶部 `md:hidden`
- 主 content: `w-full` 永远全宽 (sidebar 在 mobile 是 overlay, 不挤压 content)
- Breakpoint: `md` = 768px (Tailwind 默认)

### 实现逻辑
```
sidebarOpen 默认 false
useEffect on mount: if window.innerWidth >= 768 setSidebarOpen(true)
汉堡 click → setSidebarOpen(true)
backdrop/close click → setSidebarOpen(false)
nav class: fixed md:static, z-50 md:z-auto
  translate-x-0 when open, -translate-x-full when closed
```

---

## Part 2: ViewListPanel + cards responsive

### 现状
- `ViewListPanel.tsx`: 无 sticky toolbar
- `ViewCardGrid` 已有 responsive grid-cols (SP-FX-13 实现)

### 目标设计
- SearchBar + ViewListToolbar 包裹在 sticky 容器
- `<div data-testid="sticky-toolbar-container" className="sticky top-0 z-10 bg-background border-b">`
- 验证 `ViewCardGrid` 仍用 `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4`

---

## Part 3: SCADA Editor mobile fallback

### 现状
- `editor-shell.tsx`: 直接渲染全部 editor panels (无屏幕尺寸检测)

### 目标设计
- `useWindowSize` hook 检测 `window.innerWidth`
- `< 768px` 显示:
  - `data-testid="editor-mobile-warning"` 警告卡
  - 文字: "请使用 >= 768px 屏幕编辑 SCADA 画面"
  - 提供 read-only preview (只渲染 `EditorCanvas` 但 pointer-events-none)
- `>= 768px` 正常渲染全部 panels

### PropertyPanel bottom-sheet
- `PropertyPanel.tsx`: 新增 `mobileMode?: boolean` prop
- `mobileMode=true` 时:
  - 改为 `fixed bottom-0 left-0 right-0 z-50` 定位
  - 高度: `max-h-[60vh]` + drag handle
  - data-testid: `property-panel-bottom-sheet`
- EditorShell 传入 `mobileMode={windowWidth < 768}`

---

## Part 4: Runtime Touch Gesture

### 现状
- `RuntimeCanvas.tsx`: 无 touch/pointer event 处理

### 目标设计: Effect F (touch gesture)

状态:
```typescript
const [transform, setTransform] = useState({ scale: 1, panX: 0, panY: 0 });
```
- scale 范围: [0.5, 3.0]
- pan 范围: 不限

Pinch-to-zoom 算法 (双指 PointerEvent):
```
pointers Map<pointerId, {x,y}>
onPointerDown: 存入 pointers
onPointerMove:
  if pointers.size == 2:
    prevDist = distance(ptr[0].prev, ptr[1].prev)
    newDist  = distance(ptr[0].curr, ptr[1].curr)
    ratio = newDist / prevDist
    newScale = clamp(scale * ratio, 0.5, 3.0)
    setTransform(t => ({ ...t, scale: newScale }))
  elif pointers.size == 1:
    dx = curr.x - prev.x
    dy = curr.y - prev.y
    setTransform(t => ({ ...t, panX: t.panX + dx, panY: t.panY + dy }))
onPointerUp/Cancel: 从 pointers 移除
```

Canvas wrapper:
```tsx
<div
  ref={gestureRef}
  style={{ transform: `translate(${panX}px, ${panY}px) scale(${scale})` }}
  className="origin-top-left touch-none"
>
  {containerRef div}
</div>
```

data-testid: `runtime-touch-container`
外层: `data-testid="runtime-gesture-wrapper"` overflow-hidden

安全约束:
- Effect F 仅监听 pointer events (不干扰 Effect A/B/D)
- Effect F cleanup 清除所有 pointer listeners
- 不修改 animation-engine, PLC invariant 完整保留

---

## Part 5: PW E2E Mobile Viewport

viewport: { width: 375, height: 667 } (iPhone SE)

测试场景:
1. AppLayout: 汉堡按钮可见 + 点击展开 sidebar
2. ViewList: 搜索栏在 mobile viewport 可见
3. Editor: mobile warning banner 可见

---

## Breakpoint 汇总

| breakpoint | px   | 用途              |
|-----------|------|-----------------|
| sm        | 640  | 卡片 2 列          |
| md        | 768  | sidebar 折叠/editor 警告 |
| lg        | 1024 | 卡片 3 列          |
| xl        | 1280 | 卡片 4 列          |
