# BIOCore 内部功能清单（含代码证据）

> 版本：v1.0 · 日期：2026-04-20 · 受众：研发 / 产品 / 交付 / QA 内部对齐
> 覆盖范围：pnpm monorepo 下 7 个后端包 + 1 个前端包 + 共享 types 包
> 引用格式：`packages/<包>/<文件>:行号或关键符号`

---

## 0. 阅读导引

- 本清单是**盘点文档**，不是需求文档：每一条功能都必须能在代码里找到入口。
- 状态图例：✅ 已实现且可用 · 🟡 已有代码但前端尚未接通/仍在联调 · 🔵 v2 规划，仅框架 · ❌ 明确不做
- 引用的行号以 2026-04-20 日仓库快照为准；后续重构请同步更新。

---

## 1. 产品定位（一句话）

BIOCore 是**面向非 GMP 研发场景的发酵罐控制 + 数据分析 + 本地 AI 平台**，以 S7-200 SMART G2 PLC 为硬件内核，用 Node.js + React 全栈替代 Eppendorf BioFlo / Sartorius BIOSTAT 自带上位机，以 **1/5 成本**提供开源可改、数据自留、本地推理、ISA-88 合规的完整技术栈。

核心价值三角：**硬件安全（PLC 独立连锁） × 软件开放（全栈可改） × 数据自主（本地 InfluxDB + SQLite，AI 本地优先）**。

---

## 2. 技术栈速览

| 维度 | 选型 | 约束 |
|---|---|---|
| 后端运行时 | Node.js 20 LTS + TypeScript 严格模式 | 函数式优先，文件 <400 行 |
| Monorepo | pnpm workspace，9 个包 | `pnpm-workspace.yaml` |
| PLC 通讯 | `node-snap7`（S7）+ `modbus-serial`（Modbus RTU/TCP） | **不使用 `nodes7`** |
| 状态机 | XState v5 | 6 状态严格按 ISA-88 |
| 时序库 | InfluxDB OSS 2.7（Flux） | Docker Compose 部署 |
| 业务库 | SQLite（`better-sqlite3`，WAL） | 单文件，易备份 |
| 前端 | Next.js 14 App Router + shadcn/ui + Tailwind + Plotly.js + Zustand | |
| 拖拽配方 | `@dnd-kit` v6 | Phase 可配置，Step 硬编码 |
| 本地 AI | Ollama + Qwen2.5-7B | AI **永不直接写 PLC** |
| 统计分析 | 纯 JS 自研（CUSUM / DTW / 包络线） | 零外部依赖 |
| 反向代理 | nginx / Caddy | TLS + WebSocket wss:// |

---

## 3. 包盘点（8 个包）

### 3.1 `@biocore/plc-driver` — PLC 通讯底座

**职责：** 多协议 PLC 连接、变量地址解析、工程量转换、心跳监控。

| # | 功能 | 代码证据 | 状态 |
|---|---|---|---|
| 1 | S7 协议适配器（DB1/DB2，基于 `node-snap7`） | `packages/plc-driver/src/index.ts:41-73`（`Snap7Adapter.connect`） | ✅ |
| 2 | Modbus RTU/TCP 适配器 | `packages/plc-driver/src/index.ts:100-150`（`ModbusAdapter`） | ✅ |
| 3 | 双向心跳：PC 写 `VB400`，PLC 回写 `VB401` | `packages/plc-driver/src/index.ts:9-13`（协议注释） | ✅ |
| 4 | V 区地址解析与线性标定（`parseAddr` / `scale` / `unscale`） | `packages/plc-driver/src/utils.ts` | ✅ |
| 5 | 变量映射管理（Tag ↔ V 区，CSV/JSON 导入） | `packages/plc-driver/src/variable-mapping.ts` | ✅ |
| 6 | 默认 V 区模板（随配置打包） | `config/default-plc-variables.ts` | ✅ |

### 3.2 `@biocore/batch-engine` — ISA-88 状态机与 Phase/Step 引擎

**职责：** 批次生命周期、阶段推进、故障联锁、按钮使能。

| # | 功能 | 代码证据 | 状态 |
|---|---|---|---|
| 1 | 6 状态机：`idle / running / held / paused / stopped / complete` | `packages/batch-engine/src/batch-controller.ts:32-80` | ✅ |
| 2 | 状态码到 PLC 寄存器 `VW2` 的双向映射 | `packages/batch-engine/src/batch-controller.ts:46-48` | ✅ |
| 3 | 14 种标准 Phase + Step 推进引擎 | `packages/batch-engine/src/step-engine.ts` | ✅ |
| 4 | 通讯看门狗：3s 丢心跳 → 自动 Hold | `packages/batch-engine/src/comm-watchdog.ts` | ✅ |
| 5 | 运行故障监控 + 联锁条件评估 | `packages/batch-engine/src/running-fault-monitor.ts` | ✅ |
| 6 | 配方校验（合法性 + 参数范围 + 单位） | `packages/batch-engine/src/recipe-validator.ts` | ✅ |
| 7 | 按钮使能状态（Start/Hold/Resume/Stop 条件互斥） | `packages/batch-engine/src/batch-controller.ts:61-64` | ✅ |

### 3.3 `@biocore/data-service` — 时序 + 业务双库采集

**职责：** 过程值读取、计算参数衍生、写 InfluxDB、服务业务 SQLite。

| # | 功能 | 代码证据 | 状态 |
|---|---|---|---|
| 1 | 采集调度：1s → WebSocket 推前端，60s → InfluxDB | `packages/data-service/src/collector.ts:1-6`（策略注释）+ `78-150`（`DataCollector`） | ✅ |
| 2 | `ProcessValues` 过程值接口（8AI + 状态字） | `packages/data-service/src/collector.ts:39-59` | ✅ |
| 3 | `CalculatedParams`：OUR / CER / RQ / OTR / kLa / Vs / μ | `packages/data-service/src/collector.ts:61-76` | ✅ |
| 4 | 可配置公式系数（现场校准用） | `packages/data-service/src/collector.ts:16-27` | ✅ |
| 5 | 公式运算器（表达式求值 + 单位转换） | `packages/data-service/src/formula-evaluator.ts` | ✅ |
| 6 | 软测量中间计算（OD / 葡萄糖 / 产物） | 依赖 `@biocore/soft-sensor` | 🟡 |

### 3.4 `@biocore/ai-gateway` — 本地优先 AI 网关

**职责：** LLM 对话、NL→Flux、批次摘要、报告生成。

| # | 功能 | 代码证据 | 状态 |
|---|---|---|---|
| 1 | Ollama 本地模型客户端 | `packages/ai-gateway/src/ollama-client.ts` | ✅ |
| 2 | LLM 统一接口（本地优先，云端 fallback） | `packages/ai-gateway/src/llm-client.ts:1-50` | ✅ |
| 3 | 自然语言 → InfluxDB Flux 查询 | `packages/ai-gateway/src/nl-to-flux.ts` | 🟡 |
| 4 | 批次自动摘要（完成后触发 LLM 归纳） | `packages/ai-gateway/src/batch-summary.ts:1-30` | 🟡 |
| 5 | 上下文构建器（近 N 批次统计喂入 Prompt） | `packages/ai-gateway/src/context-builder.ts:1-40` | ✅ |
| 6 | 报告导出（HTML / DOCX / PDF） | `packages/ai-gateway/src/report-generator.ts` | 🟡 |
| 7 | **安全约束**：任何建议进入「建议缓冲区」，严禁直接写 PLC | 约定由调用方遵守，`batch-engine` 不接受来自 `ai-gateway` 的写入 API | ✅ 架构约束 |

### 3.5 `@biocore/ai-analytics` — 纯 JS 统计分析

**职责：** 不依赖外部 AI 的实时/离线分析，零模型加载。

| # | 功能 | 代码证据 | 状态 |
|---|---|---|---|
| 1 | CUSUM 实时异常检测（5 通道，baseline 学习） | `packages/ai-analytics/src/cusum.ts:23-101`（`CUSUMDetector`） | ✅ |
| 2 | DTW 批次相似度 + 路径回溯 | `packages/ai-analytics/src/dtw.ts:111-149`（`dtwDistance`） | ✅ |
| 3 | 历史包络线：均值 ± Nσ，越界预警 | `packages/ai-analytics/src/envelope.ts`（`buildEnvelope` / `checkEnvelope`） | ✅ |
| 4 | 基础统计工具（`mean` / `std` / `movingAverage`） | `packages/ai-analytics/src/index.ts:244-264` | ✅ |
| 5 | Van't Riet 经验式 kLa 估算 | `packages/ai-analytics/src/index.ts:211-230`（`estimateKLa`） | ✅ |

### 3.6 `@biocore/soft-sensor` — 软测量推断与补料建议

**职责：** 根据 DO、pH、搅拌、排气 CO₂ 等反推 OD/葡萄糖/产物；输出补料建议。

| # | 功能 | 代码证据 | 状态 |
|---|---|---|---|
| 1 | 线性回归软测量（`SoftSensorEngine.predict`） | `packages/soft-sensor/src/index.ts:25-80` | 🟡 |
| 2 | 置信区间与外推检测 | `packages/soft-sensor/src/index.ts:45-90`（`PredictionResult`） | 🟡 |
| 3 | Monod 动力学补料建议 | `packages/soft-sensor/src/feed-advisor.ts`（`FeedAdvisor`） | 🔵 |
| 4 | 根因分析（异常参数回溯） | `packages/soft-sensor/src/root-cause.ts` | 🔵 |
| 5 | 多反应器联合优化 | `packages/soft-sensor/src/multi-reactor.ts` | 🔵 |

### 3.7 `@biocore/experiment-optimizer` — 实验设计与贝叶斯优化

**职责：** 帮用户设计 DoE、从历史批次反推最优工艺区域、给出下一批建议参数。

| # | 功能 | 代码证据 | 状态 |
|---|---|---|---|
| 1 | 贝叶斯优化（GP 代理模型） | `packages/experiment-optimizer/src/bayesian-optimizer.ts:1-50` | 🔵 |
| 2 | 多保真度优化（低成本小试 → 高成本中试） | `packages/experiment-optimizer/src/multi-fidelity.ts` | 🔵 |
| 3 | 全因子设计（2^k / 3^k） | `packages/experiment-optimizer/src/doe-designs.ts:1-40`（`generateFullFactorial`） | ✅ |
| 4 | CCD / Box-Behnken | `packages/experiment-optimizer/src/doe-designs.ts`（`generateCCD` / `generateBoxBehnken`） | ✅ |
| 5 | 正交设计（内置 L9 / L16 / L27 阵列） | `packages/experiment-optimizer/src/doe-orthogonal.ts`（`BUILTIN_ARRAYS`） | ✅ |
| 6 | 极差分析 + 交互项识别 | `packages/experiment-optimizer/src/doe-range-analysis.ts` | ✅ |
| 7 | 设计诊断：正交性、条件数 | `packages/experiment-optimizer/src/doe-diagnostics.ts`（`evaluateDesign`） | ✅ |

### 3.8 `@biocore/types` — 共享类型

**职责：** 跨包类型中心，任何变更都要经严格评审。

| # | 类型 | 代码证据 |
|---|---|---|
| 1 | `PLCConnection` / `PLCVariableMapping` / `PLCConnectionStatus` | `packages/types/src/index.ts:25-74` |
| 2 | `BatchState` / `BatchEvent` / `PhaseType` | `packages/types/src/index.ts:78-107` |
| 3 | `Recipe` / `PhaseConfig` / `StepDefinition` | `packages/types/src/index.ts:141-200` |
| 4 | `ProcessValues` / `CalculatedParams` | 在 `data-service` 中声明，必要时上浮到 types |

---

## 4. Server 与前端

### 4.1 `packages/server` — API 网关 + WebSocket 广播

- 总入口：`packages/server/src/index.ts`
- 功能面：约 **97 个 REST 端点 + WebSocket**（批次控制、配方 CRUD、PLC 配置、AI 对话、导出、审计查询、用户权限）
- 权限：JWT 浏览器登录 + API Key（给 MES / LIMS 机器账号）
- 审计日志：所有状态变更写 SQLite `audit_logs` 表

### 4.2 `packages/web-ui` — Next.js 14 前端（App Router）

**已有路由：** 全部位于 `packages/web-ui/src/app/`。

| 路由 | 作用 | 源文件 | 状态 |
|---|---|---|---|
| `/` | 首页跳转 | `app/page.tsx` | ✅ |
| `/login` | 登录页 | `app/login/page.tsx` | ✅ |
| `/dashboard` | 主监控面板（多反应器、实时图、Phase 控制） | `app/dashboard/page.tsx` | ✅ |
| `/batches` | 批次列表 + 历史查询 + 导出 | `app/batches/page.tsx` | ✅ |
| `/batches/[id]` | 批次详情（工艺曲线、Phase 日志、告警） | `app/batches/[id]/page.tsx` | ✅ |
| `/batches/[id]/similar` | 相似批次分析（DTW + 包络线） | `app/batches/[id]/similar/page.tsx` | 🟡 |
| `/recipes` | 配方库 | `app/recipes/page.tsx` | ✅ |
| `/recipes/[id]/edit` | 配方编辑 v1 | `app/recipes/[id]/edit/page.tsx` | ✅ |
| `/recipes/[id]/edit-v2` | 配方编辑 v2（`@dnd-kit` 拖拽） | `app/recipes/[id]/edit-v2/page.tsx` | ✅ |
| `/recipes/review-queue` | 配方审核队列 | `app/recipes/review-queue/page.tsx` | 🟡 |
| `/analysis/spc` | SPC 控制图 | `app/analysis/spc/page.tsx` | 🟡 |
| `/analysis/kpi` | KPI 仪表板 | `app/analysis/kpi/page.tsx` | 🟡 |
| `/analysis/soft-sensor` | 软测量模型管理 | `app/analysis/soft-sensor/page.tsx` | 🟡 |
| `/analysis/raw-materials` | 原料追溯 + BOM | `app/analysis/raw-materials/page.tsx` | 🔵 |
| `/analysis/audit-logs` | 审计日志 | `app/analysis/audit-logs/page.tsx` | ✅ |
| `/doe` | DoE 编辑器 | `app/doe/page.tsx` | 🟡 |
| `/doe/[id]` | DoE 结果分析 | `app/doe/[id]/page.tsx` | 🔵 |
| `/ai` | AI 对话助手 | `app/ai/page.tsx` | 🟡 |
| `/explorer` | Flux 查询浏览器 | `app/explorer/page.tsx` | ✅ |
| `/trends` | 多批次趋势对比 | `app/trends/page.tsx` | ✅ |
| `/clean` | CIP 清洗工艺 | `app/clean/page.tsx` | 🟡 |
| `/settings` | 设置主页 | `app/settings/page.tsx` | ✅ |
| `/settings/device-config` | 反应器配置（容积、PID） | `app/settings/device-config/page.tsx` | ✅ |
| `/settings/plc-config` | PLC 连接与变量表 | `app/settings/plc-config/page.tsx` | ✅ |
| `/settings/phase-templates` | Phase 模板库 | `app/settings/phase-templates/page.tsx` | ✅ |
| `/settings/formula-config` | 公式系数配置 | `app/settings/formula-config/page.tsx` | ✅ |
| `/settings/interlock-config` | 联锁条件 | `app/settings/interlock-config/page.tsx` | ✅ |
| `/settings/calibration` | 传感器校准向导 | `app/settings/calibration/page.tsx` | ✅ |
| `/settings/ai-config` | AI 引擎配置（Ollama / 云端） | `app/settings/ai-config/page.tsx` | ✅ |
| `/settings/api-keys` | API Key 管理 | `app/settings/api-keys/page.tsx` | ✅ |
| `/settings/users` | 用户管理 | `app/settings/users/page.tsx` | ✅ |
| `/settings/permissions` | 角色权限 | `app/settings/permissions/page.tsx` | ✅ |
| `/settings/data-maintenance` | 数据备份 / 恢复 | `app/settings/data-maintenance/page.tsx` | ✅ |

**组件资产：** `packages/web-ui/src/components/` 下包含 `BatchCalibrationWizard`、`BatchComparePanel`、`SampleImportDialog`、`dashboard/*`、`recipes/*`、`report/*`、`trends/*`、`charts/*`、`ui/*`（shadcn 派生）。

---

## 5. 关键运维 / 部署能力

### 5.1 Docker Compose

- 文件：`docker-compose.yml`
- 组件：InfluxDB 2.7（`biocore-influxdb`，端口 `8086`，默认 bucket `fermentation` 保留 365 天）
- 卷：`influxdb_data` / `influxdb_config` 持久化
- 初始凭证：`admin / biocore123`（**生产必改**）

### 5.2 环境变量（来自 `.env.example`）

| Key | 默认 | 说明 |
|---|---|---|
| `PORT` | 3001 | Express 端口 |
| `NODE_ENV` | development | `production` 时关闭调试 |
| `PLC_IP` | 192.168.2.1 | PLC 连接地址 |
| `PLC_HEARTBEAT_TIMEOUT_MS` | 3000 | 心跳超时触发自动 Hold |
| `INFLUX_URL` / `INFLUX_TOKEN` | localhost:8086 / biocore-dev-token | InfluxDB 连接 |
| `SQLITE_PATH` | `./data/biocore.db` | 业务库位置 |
| `OLLAMA_URL` / `OLLAMA_MODEL` | localhost:11434 / qwen2.5:7b | 本地 LLM |
| `MOCK_PLC` | true | **生产必须 `false`** |
| `JWT_SECRET` | — | JWT 签名密钥 |
| `AUTH_ENABLED` | true | 认证总开关 |

### 5.3 常用脚本（`package.json`）

| 命令 | 作用 |
|---|---|
| `pnpm dev` | server + ui 同时热启 |
| `pnpm dev:server` | 仅后端 |
| `pnpm dev:ui` | 仅前端（Next.js dev） |
| `pnpm build` | 全量编译 |
| `pnpm db:init` | SQLite 建表 + 种子数据 |
| `pnpm plc:test` | PLC 实机 ping + 握手 |

### 5.4 生产上线 Checklist（对照 `docs/部署说明.md`）

1. `MOCK_PLC=false` 且 `PLC_IP` 指向真机
2. 改 `admin` 默认密码
3. 颁发第一把 API Key 给 MES / LIMS
4. SQLite 备份策略（`data/biocore.db` 每日备份）
5. 反向代理 + TLS（nginx / Caddy，开 `wss://`）
6. InfluxDB Token 轮换

---

## 6. 已实现 vs 待实现（交付视角）

### ✅ Phase 1 MVP — 首版可交付能力

- S7 + Modbus PLC 通讯，双向心跳，断线自动 Hold
- ISA-88 六状态机 + 14 种 Phase/Step 引擎
- Dashboard 实时监控 + 多反应器切换
- 配方编辑器 v2（拖拽）
- PLC 配置、Phase 模板、公式、联锁、校准、AI、API Key、用户、权限、数据备份等 **全套设置页**
- 审计日志、趋势对比、Flux 数据浏览器
- JWT 浏览器登录 + API Key 机器账号

### 🟡 进行中（代码已基本就绪，前端/联调收尾）

- 软测量 UI 接通、AI 批次摘要自动触发、SPC 控制图、KPI 仪表板
- DoE 编辑器体验优化、相似批次 UI、配方审核队列
- CIP 工艺工作流、AI 报告 DOCX/PDF 导出

### 🔵 v2 规划

- Monod 补料顾问自动建议（仍走建议缓冲区）
- 贝叶斯 + 多保真度联合优化
- 根因分析自动触发（异常 → 参数链回溯）
- 原料追溯 / BOM
- ONNX 软测量推断（目前是线性回归）

### ❌ 明确不做

- GMP 验证与 21 CFR Part 11 合规认证（定位非 GMP R&D）
- 纯云端 SaaS（坚持本地优先，AI 本地推理）
- 原生移动 App（浏览器自适应即可）

---

## 7. 关键架构约束（务必对齐）

1. **PLC 独立安全**：联锁（超温、超压、低液位）由 PLC 本体完成，软件崩溃或断网时 PLC 依旧按内置逻辑动作。
2. **AI 永不直写 PLC**：任何来自 `ai-gateway` / `soft-sensor` / `experiment-optimizer` 的建议只能进入「建议缓冲区」，人工确认后由 `batch-engine` 下发。
3. **双库分工不可混**：时序（高频过程值）→ InfluxDB；业务（配方、批次、用户、审计）→ SQLite。
4. **前端状态源单一**：Zustand 管状态，任何 WebSocket 事件统一 reducer。
5. **文件 < 400 行**：超过请拆分；便于审查与单测。

---

## 8. 文档索引（`docs/`）

- `00_BIOCore_产品规划主文档.md`
- `01_PLC硬件规格.md` · `02_AI架构.md` · `03_工艺控制策略.md`
- `04_配方JSON规范.md` · `05_数据库Schema详设.md`
- `06_ISA-88状态机规格.md` · `07_前端UI规格.md` · `08_实验设计策略.md`
- `ARCHITECTURE.md` · `PRODUCT_OVERVIEW.md` · `API_REFERENCE.md` · `WS_PROTOCOL.md`
- `AI功能产品说明书.md` · `BIOCore_产品介绍.md` · `部署说明.md`
- Sprint 进度：`开发进度_Sprint1_API公开化.md` / `Sprint2_价值增强.md` / `Sprint3_配方v2.md`

---

_本清单为"盘点"，不替代 `API_REFERENCE.md` 与 `ARCHITECTURE.md` 的详细定义；有冲突以代码和 API 文档为准。_
