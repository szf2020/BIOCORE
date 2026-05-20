# CLAUDE.md — BIOCore 项目规范

## 产品
BIOCore 是实验室发酵罐控制平台。S7-200 SMART G2 PLC + Node.js 全栈 + React 前端。目标：替代 Eppendorf/Sartorius 方案，成本降至 1/5。

## 架构
pnpm monorepo，7 个后端包 + 1 个前端包。双库：InfluxDB（时序）+ SQLite（业务）。本地 AI 优先（Ollama）。

## 当前阶段
Phase 1 MVP：PLC 通讯、基础 Dashboard、ISA-88 六状态机、PLC 配置页面。

## 技术约束
- PLC 通讯：node-snap7（S7 协议）+ modbus-serial（Modbus RTU），不用 nodes7
- 状态机：XState v5，6 状态严格按 ISA-88
- 前端：Next.js 14 + shadcn/ui + Tailwind + Plotly.js + Zustand
- 配方编辑：@dnd-kit 拖拽，Phase 可配置，Step 硬编码
- AI 模块永远不能直接写入 PLC，必须经"建议缓冲区"
- PLC 断线 → 前端状态机自动 Hold；PLC 独立安全连锁继续运行

## 风格
TypeScript 严格模式。中文注释。函数式优先，class 仅用于有状态模块。文件 <400 行。

## UI 变更验收（强制）
任何 UI 改动（位置、字号、颜色、间距、布局、可见性等任何渲染相关变化）声明完成前必须：
1. **截图**：用 playwright MCP 启动 dev server，导航到改动影响的真实路由（不是 dev fixture），截图保存到本仓库可读路径
2. **自验**：用 `Read` 工具加载截图，逐 widget / 区域**视觉**核对，不能只看 DOM 属性数值（math 对 ≠ 视觉对）
3. **判定**：截图明显不对就继续修改 + 再截图 + 再自验，直到视觉正确
4. **反馈**：把最终通过的截图发给用户，附简要差异说明

不允许仅靠单测、DOM `getAttribute` 数值、或"应该居中了"的逻辑推断声明 UI 修复完成。
