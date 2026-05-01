# BIOCore 架构拆解与开发计划 (v2 修订版)

> 开发经理视角 · 基于8份规划文档 + 4项设计更新
> 修订日期: 2026-04-05

---

## 一、项目全景

BIOCore 是面向非GMP实验室的生物反应器智能控制平台，基于 S7-200 SMART G2 PLC + Node.js 全栈架构，覆盖从 PLC 实时通讯、ISA-88 批次控制、工艺配方管理到本地AI预测优化的完整链路。

**v2 修订核心变更:**
1. PLC通讯库从 nodes7 切换至 **node-snap7 (S7协议) + modbus-serial (Modbus RTU)**
2. PC↔PLC **双向心跳协议**: VB400(PC→PLC) + VB401(PLC→PC)，断线自动Hold
3. 配方编辑器改为 **@dnd-kit 拖拽模式**，Phase可配置，从模板库拖入时间线
4. 新增 **CLAUDE.md** 规范文件供 Claude Code 预加载

---

## 二、系统架构 — "三层解耦 + 双向心跳"

```
┌─────────────────────────────────────────────────────────────┐
│                    用户交互层 (Browser)                       │
│  React/Next.js + shadcn/ui + Plotly.js + @dnd-kit           │
│  Dashboard · 拖拽式配方编辑器 · PLC通讯配置页面 · AI助手       │
└─────────────────────┬───────────────────────────────────────┘
                      │  HTTP / WebSocket
┌─────────────────────▼───────────────────────────────────────┐
│                  应用逻辑层 (Node.js)                         │
│  ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌────────────┐ │
│  │ plc-driver  │ │batch-engine│ │data-     │ │ ai-gateway │ │
│  │ node-snap7  │ │ XState v5  │ │service   │ │ Ollama LLM │ │
│  │ modbus-     │ │ 6状态机    │ │ InfluxDB │ │ NL→Flux    │ │
│  │ serial      │ │ CommWatch  │ │ SQLite   │ │ 批次摘要   │ │
│  └──────┬─────┘ └─────┬──────┘ └────┬─────┘ └──────┬─────┘ │
│         │             │             │              │        │
│  ┌──────▼─────────────▼──┐  ┌──────▼──────────────▼──────┐ │
│  │   SQLite (业务库)      │  │   InfluxDB (时序库)        │ │
│  │ 状态·配方·审计·PLC配置  │  │ 过程数据·趋势·AI上下文     │ │
│  └────────────────────────┘  └────────────────────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │  双向心跳: VB400(PC→PLC) + VB401(PLC→PC)
          ┌───────────┼───────────┐
          │ S7协议    │ Modbus    │
          │(TCP/102)  │ RTU(232)  │
          └───────────┼───────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│               设备执行层 (S7-200 SMART G2)                    │
│  PID闭环(8回路) · 安全连锁(硬逻辑) · 心跳监测+安全驻留        │
│  VB400不变3秒→补料停·搅拌降速·温度pH维持                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、功能模块拆解

### M1 — plc-driver

| 子模块 | 职责 | 技术 | 优先级 |
|--------|------|------|--------|
| 协议适配器 | IProtocolAdapter接口 + Snap7/Modbus双实现 | node-snap7, modbus-serial | P0 |
| 双向心跳 | PC写VB400+读VB401, 3秒超时 | 1秒定时器 | P0 |
| VFD客户端 | 变频器Modbus RTU (频率/电流/故障码) | modbus-serial | P0 |
| 变量映射 | Tag↔V区, JSON/CSV导入导出 | SQLite | P0 |

### M2 — batch-engine

| 子模块 | 职责 | 技术 | 优先级 |
|--------|------|------|--------|
| 状态机 | 6状态 + comm_loss/comm_restored | XState v5 | P0 |
| CommWatchdog | 心跳→断线Hold→恢复等人工确认 | EventEmitter | P0 |
| Phase执行 | 14种可配置Phase | 策略模式 | P0 |
| Step引擎 | Phase内固定Step, 7种完成条件 | 硬编码 | P0 |

### M7 — web-ui

| 子模块 | 职责 | 技术 | 优先级 |
|--------|------|------|--------|
| Dashboard | 控制面板+通讯状态指示 | Plotly.js | P0 |
| 拖拽配方编辑器 | Phase模板库→拖入时间线→参数表单 | @dnd-kit | P0 |
| PLC配置页面 | 连接管理+变量表+协议选择 | 表格编辑 | P0 |

---

## 四、技术栈

| 层级 | 选型 | v1→v2变更 |
|------|------|----------|
| PLC S7 | **node-snap7** | ~~nodes7~~ → node-snap7 (Snap7 C库) |
| PLC Modbus | **modbus-serial** | 新增 |
| 拖拽 | **@dnd-kit** | ~~react-beautiful-dnd~~ → @dnd-kit |
| 其余 | 不变 | Node.js 20 + XState v5 + Next.js 14 + InfluxDB + SQLite |

---

## 五、双向心跳协议

| 地址 | 方向 | 写入方 | 超时动作 |
|------|------|--------|----------|
| VB400 | PC→PLC | Node.js每秒++ | PLC: 3秒不变→安全驻留 |
| VB401 | PLC→PC | PLC每秒++ | PC: 3秒不变→Hold |

断线期间: 补料全停 · 搅拌200rpm · 温度/pH PID继续 · 安全连锁继续
恢复后: PC端emit(comm_restored) → 操作员手动cmd_restart

---

## 六、开发路线图

### Phase 1 MVP (W1-W13)

| 周 | 任务 |
|----|------|
| W1-2 | monorepo搭建 |
| W3-4 | plc-driver: node-snap7 + modbus-serial + 双向心跳 |
| W4-5 | PLC配置页面 + CommWatchdog |
| W5-6 | data-service双库 |
| W6-9 | batch-engine 6状态机 + Phase |
| W9-10 | Dashboard + 通讯状态 |
| W10-12 | 拖拽式配方编辑器 |
| W12-13 | 集成联调 |
