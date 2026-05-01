# BIOCore 产品功能介绍

> **产品定位**:实验室发酵罐智能控制平台
> **目标用户**:高校发酵实验室、生物科技初创公司、合成生物学研究团队
> **核心卖点**:以竞品 **1/5 的成本**提供发酵全生命周期的智能控制与数据分析平台

---

## 1. 产品概述

BIOCore 是基于 **S7-200 SMART G2 PLC** + **Node.js 全栈** 的**非 GMP 实验室 R&D 发酵控制平台**。替代 Eppendorf、Sartorius 等高价闭源方案,提供可定制、可扩展、可与 MES 集成的开放平台。

### 1.1 核心价值

| 维度 | 传统方案 | BIOCore |
|---|---|---|
| **成本** | Eppendorf BioFlo 320 约 ¥200k/套 | 约 ¥40k/套 (硬件 + 软件) |
| **可定制性** | 封闭黑盒,不允许二次开发 | 全开源,Node.js 修改自由 |
| **数据所有权** | 厂商云平台,需订阅 | 本地 InfluxDB + SQLite,完全自主 |
| **AI 集成** | 无或依赖云端 | **本地 LLM**(Ollama)+ ONNX 软测量 |
| **多反应器** | 单罐独立系统 | **单 PC 管 1-8 罐** |
| **审计合规** | 部分支持 | 不可篡改审计日志(SQLite 触发器) |
| **API 集成** | 专有协议 | **开放 REST + WebSocket + OpenAPI 文档** |

### 1.2 设计哲学

- **数据优先**:所有运行数据本地存储,永不依赖云端
- **可审计**:每一次参数修改都必须经"用户确认 + 原因说明",写入不可篡改日志
- **状态机驱动**:ISA-88 六状态严格约束,软件 bug 不会破坏工艺逻辑
- **安全分层**:PLC 硬互锁 + 软件双重校验 + AI 建议缓冲区(AI 永不直接写 PLC)
- **容错优先**:PLC 断线自动 Hold,数据丢失 5 分钟内内存缓冲

---

## 2. 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│  浏览器 (React + Next.js 14)                                 │
│  ├─ 监控面板  配方编辑  趋势图表  批次历史  AI 助手           │
│  └─ 设置: 设备/PLC/Phase/校准/用户/API Key/AI/数据维护        │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTP REST + WebSocket (JWT + API Key 双鉴权)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js 后端 (9 个包)                                       │
│  ├─ server           Express + Router + 97 REST 端点         │
│  ├─ plc-driver       S7 协议驱动 + 变量映射管理               │
│  ├─ batch-engine     ISA-88 状态机 (XState v5) + 14 Phase    │
│  ├─ data-service     SQLite (业务) + InfluxDB (时序)          │
│  ├─ ai-gateway       Ollama LLM + NL→Flux + 批次摘要          │
│  ├─ ai-analytics     CUSUM + DTW + 包络线 (纯 JS 统计)        │
│  ├─ soft-sensor      ONNX 推断 + Monod 补料建议 + 根因分析    │
│  ├─ experiment-optimizer  贝叶斯优化 + 多保真度              │
│  └─ web-ui           Next.js 14 前端                          │
└───────────────┬─────────────────────────────────────────────┘
                │ S7 协议 (TCP/102) 或 Modbus TCP/RTU
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Siemens S7-200 SMART G2 PLC                                │
│  └─ 8 路 PID + 安全连锁 + 8AI/4AO/14DI/10DQ                  │
│     (温度/pH/DO/压力/流量/称重/搅拌/阀门)                     │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 技术栈选型

| 层级 | 技术 | 理由 |
|---|---|---|
| 后端运行时 | **Node.js 20 LTS** | 异步 IO 天然契合 PLC 轮询 |
| 语言 | **TypeScript 严格模式** | 类型安全,重构友好 |
| PLC 通讯 | **node-snap7**(S7) + **modbus-serial**(RTU) | 主流工业协议开源库 |
| 状态机 | **XState v5** | 形式化状态机,可视化,可测试 |
| 时序数据库 | **InfluxDB OSS 2.7** | 发酵数据天然时序,Flux 查询强大 |
| 业务数据库 | **SQLite(better-sqlite3)** | 零配置,WAL 高并发,单文件易备份 |
| 前端框架 | **Next.js 14 + React 18** | App Router,SSR 可选,生态成熟 |
| UI 组件库 | **shadcn/ui + Tailwind** | 自定义风格,深色 MES 主题 |
| 拖拽 | **@dnd-kit** | 配方编辑器的拖拽排序 |
| 本地 LLM | **Ollama + Qwen2.5-7B** | 中英双语,4.5GB 内存可跑 |
| ML 推断 | **onnxruntime-node** | 纯 JS 跨平台 |
| 包管理 | **pnpm workspace monorepo** | 硬链接省空间,workspace 协议 |
| Migration | **umzug** | 轻量版本化,兼容 better-sqlite3 |
| API 文档 | **swagger-jsdoc + swagger-ui-express** | JSDoc 注解自动生成 |

---

## 3. 功能模块详解

### 3.1 监控面板 Dashboard

**一屏掌握多反应器实时状态**

**核心功能**:
- **多反应器切换**:单 PC 管理 1-8 反应器,顶部一键切换
- **大字实时参数卡片**:温度/pH/DO/搅拌/称重/罐压(text-5xl 字号,SP 蓝色徽章)
- **实时趋势图**:三通道 SVG 实时曲线(温度/pH/DO)
- **批次主控面板**:启动/暂停/恢复/放弃/复位,每个动作走审计对话框
- **Phase 控制列表**:逐 Phase 启动/保持/跳过,显示当前 Step 进度
- **倒计时显示**:主 Phase 基于 `duration_h` 倒计时,子 Phase 显示已运行时间
- **报警横幅**:未确认报警置顶显示,一键确认
- **测算值底栏**:OUR / kLa / μ / Vₗ / 累积补料 / F₀ 全览

**WebSocket 实时推送**:
- `pv_realtime` 每秒刷新 PV 值
- `state_update` 状态机变化立即推送
- `alarm` 新报警立即弹出

### 3.2 配方管理 Recipes

**拖拽式配方编辑器 + 版本化管理**

**核心功能**:
- **配方列表**:卡片流,按状态(草稿/已批准/已归档)筛选
- **拖拽式编辑器**:
  - 左侧 Phase 模板库(14 种,按 category 分组)
  - 右侧时间线(拖拽排序 + 连接线动画)
  - 点击 Phase 展开参数面板,根据模板的 `param_schema` 动态生成表单
- **两种执行模式**:
  - **自由模式**(free):操作员手动启动每个 Phase,Phase 间用虚线连接
  - **顺序模式**(sequential):Phase 完成后自动推进,带箭头连接
- **版本管理**:recipe_id + version 组合主键,支持多版本并存
- **状态流转**:`draft` → `approved` → `archived` / `superseded`
- **锁定后才可下载**:只有 `approved` 状态的配方能下载到反应器
- **JSON 导入/导出**:便于备份与复用

### 3.3 批次历史与报告 Batches

**完整的批次可追溯性**

**核心功能**:
- **批次列表**:按启动时间倒序,支持分页
- **批次详情**:
  - 基本信息(配方/版本/菌种/操作员/起止时间/最终状态)
  - 状态流转日志(state_transitions 完整时间轴)
  - Phase/Step 执行历史(含 condition 与实际值)
  - 离线取样数据(OD/DCW/葡萄糖/产物 titer)
  - 报警历史
  - 审计日志
- **完整报告导出**:
  - JSON(全部数据)
  - CSV(时序数据 + 离线数据合并)
  - (规划中)PDF 报表(基于 html2pdf)
- **AI 自动摘要**:`POST /batches/:id/generate-summary` 调用本地 LLM 生成批次总结

### 3.4 趋势图表 Trends

**类股票 K 线的多通道趋势分析**

**核心功能**(Sprint 2 规划扩展):
- 反应器下拉选择
- 时间范围快捷按钮(1h / 6h / 12h / 24h / 全程 / 自定义)
- 7 种参数可选(温度/pH/DO/搅拌/通气/补料/罐压)
- 多通道叠加 + 颜色编码
- CSV/PNG 导出
- (Sprint 2)多批次叠加对比 + LTTB 下采样 + ECharts 滚轮缩放

### 3.5 PLC 通讯配置 PLC Config

**支持 3 种工业协议**

**核心功能**:
- 多 PLC 连接管理(S7 / Modbus TCP / Modbus RTU)
- 连接测试(实际握手 + 读取测试地址)
- **变量地址映射表**:
  - tag_name(供代码引用) + plc_address(如 `VW100`、`DB2.DBW10`)
  - 数据类型(BOOL / INT16 / INT32 / FLOAT32 / UINT16)
  - 读写方向(READ / READWRITE)
  - 工程量缩放(raw_min/max ↔ eng_min/max,自动校验避免颠倒)
  - 轮询频率
  - 分组(模拟量/数字量/PID/控制字/心跳等)
- **默认 V 区地址模板**:一键加载 BIOCore 标准配置(21 个常用变量)
- **CSV / JSON 导入导出**:支持从 Excel 批量配置
- **双向心跳**:PC 写 VB400 计数器,PLC 写 VB401 回信,3 秒超时触发 Hold

### 3.6 Phase 模板配置 Phase Templates

**可配置的 14 种 Phase 类型**

**14 种内置 Phase**:
- 系统操作:`Prepare`, `AddWater`, `ManualAdd`
- 温控:`Heating`, `TempControl`
- 过程控制:`Agitation`, `Feeding`, `PHControl`, `DOControl`, `Aeration`
- 发酵主体:`Fermentation`
- 清洗灭菌:`SIP`, `CIP`
- 出料:`Discharge`

**每个模板包含**:
- 图标 + 颜色 + 分类
- **Step 序列**:每个 Step 有名称、描述、完成条件
- **完成条件类型**(7 种):
  - `duration` — 持续时间
  - `>=` / `<=` — 阈值穿越
  - `in_band` — 进入死区
  - `accumulated` — 累积量
  - `delta` — 变化量
- **AND/OR/NOT 组合条件**:Step 完成需要多条件联合
- **PLC 参数绑定**:将 PLC 变量(如 TEMP_SV)绑定到 Phase 参数,Phase 启动时自动写入 PLC
- **自定义跳转**:Step 完成后跳到指定 Step(支持循环/跳过)

### 3.7 AI 助手 AI

**本地 LLM + 建议缓冲区**

**核心功能**:
- **本地 Ollama 部署**:qwen2.5:7b 默认(中英双语,4.5GB 内存)
- **云端回退**:Ollama 不可用时回退到 Anthropic/OpenAI(可配置)
- **AI 会话**:保存历史消息,关联 batch_id
- **NL → Flux 查询**:自然语言转 InfluxDB Flux,自动执行并返回结果
- **AI 建议缓冲区**(核心安全设计):
  - AI 分析数据后产生建议(例如"温度建议从 37 调到 38")
  - 建议写入 `ai_suggestions` 表,status=pending
  - 操作员在 UI 中查看建议 → 确认或拒绝
  - 采纳后才会真正修改 PLC 参数
  - **AI 永远不能直接写入 PLC**

### 3.8 设备配置 Device Config

**硬件资产管理**

- 反应器 CRUD(ID / 名称 / 罐体容积 / 关联 PLC 连接)
- 启用/禁用开关(禁用的罐不出现在 Dashboard)
- 关联 PLC:下拉选择(PLC 连接在 `/settings/plc-config` 统一管理)

### 3.9 传感器校准 Calibrations

**两点线性校准**

- 低点标准液 + 高点标准液
- 自动计算斜率与偏置
- 历史校准记录(审计追溯)
- pH / DO / 温度 / 压力 / 流量 / 称重 全支持

### 3.10 用户管理 Users

**4 级角色 + 审计追踪**

| 角色 | 权限 |
|---|---|
| `admin` | 全部(包括用户管理/API Key/系统配置) |
| `engineer` | 配方/Phase 模板/校准 |
| `operator` | 启动/停止批次 |
| `viewer` | 只读 |

### 3.11 API 密钥管理 API Keys(Sprint 1 新增)

**为 MES 等外部系统颁发长期凭证**

- 创建时唯一一次返回 raw key(`ak_xxx.yyyyy`)
- 后端只存 salt + sha256(salt+rawKey),不可反向
- 撤销软删除(`revoked=1`),保留审计追溯
- 撤销后可 rotate(复用 name/scopes 生成新 key)
- usage 端点显示 last_used_at + 最近 100 条审计

### 3.12 数据维护 Data Maintenance

- **手动备份**:SQLite 数据库整库 copy 到 `data/backups/`
- **自动备份**:按小时间隔(默认 24h)
- **保留策略**:InfluxDB 原始数据保留天数(默认 365 天)
- **日志清理**:清理过期的 `state_transitions` 和 `step_logs`(audit_logs 不受影响)

---

## 4. 核心技术特性

### 4.1 ISA-88 状态机(批次控制引擎)

**六状态严格约束**:
```
idle → running ⇄ paused → stopped → idle (cmd_reset)
         ↓ ↑
         held (仅故障触发)
         ↓
         restart → running
```

**关键约束**(违反则破坏系统):
1. `running` **不能直接** stop,必须先 pause
2. `pause` 只由操作员手动触发,`held` 只由故障自动触发
3. Phase 完成后是否自动推进取决于配方 `execution_mode`(free/sequential)
4. PLC 断线 → 自动 Hold,补料全停,搅拌降速,温度/pH 由 PLC 独立 PID 维持
5. CIP/SIP 与生产 Phase 互锁,发酵运行中禁止启动 CIP/SIP
6. 配方必须 approved 才能下载

**实现**:使用 XState v5 定义状态机,全部状态转换可形式化验证。

### 4.2 双数据库架构

| 数据库 | 用途 | 存储内容 | 保留 |
|---|---|---|---|
| **SQLite (better-sqlite3)** | 业务数据 | 用户/配方/批次/Phase/Step/报警/审计/校准/API Key | 永久 |
| **InfluxDB 2.7** | 时序数据 | PV 值(温度/pH/DO 等 1Hz 写入) | 365 天可配 |

**分工理由**:
- SQLite:强一致性,关系模型,触发器保证审计不可篡改
- InfluxDB:时间序列优化,Flux 查询,压缩率高

### 4.3 不可篡改审计日志

**SQLite 触发器**防止 UPDATE/DELETE:
```sql
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs禁止UPDATE'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs禁止DELETE'); END;
```

**审计字段**:
- `user_id`, `action`, `target_type`, `target_id`, `old_value`, `new_value`, `reason`, `ip_address`, **`trace_id`**, `timestamp`

**审计覆盖**:所有用户输入写操作(批次启停/配方审批/用户 CRUD/校准更新/API Key 操作/PLC 配置变更等),UI 通过 `useAudit` hook 统一强制。

### 4.4 PLC 双向心跳

**机制**:
- PC 每秒递增计数器写入 `VB400`
- PLC 梯形图检测 `VB400` 变化,异步回写 `VB401`
- PC 读 `VB401` 与上次对比,3 秒未变 = 通讯丢失
- 触发 Hold + `comm_loss` 事件,补料全停搅拌降速

**独立安全回路**:
- PLC 独立跑温度/pH/DO PID 回路,不依赖 PC
- PC 断线后 PLC 仍能维持基本工艺
- 恢复连接后 PC 重新接管

### 4.5 本地 AI(零云端依赖)

**Ollama 本地 LLM**:
- qwen2.5:7b 默认(中英双语)
- 4.5GB 内存占用
- 支持 NL → Flux 查询转换
- 批次数据智能摘要
- 云端回退(Anthropic/OpenAI)仅在 Ollama 不可用时

**ONNX 软测量**(Python 训练 + JS 推断):
- 线性回归 baseline(当前)
- XGBoost/LightGBM(规划)
- 生物量 / 底物 / 产物浓度推断

**AI 分析**:
- CUSUM 异常检测(per-batch per-channel)
- DTW 批次相似度匹配
- Monod 方程补料建议
- 根因分析(Fishbone 因果关系)

### 4.6 多反应器并行

- 单 PC 支持 **1-8 反应器**
- 每个反应器独立 `BatchController` 实例
- 独立 XState 状态机,互不干扰
- WebSocket 按 `reactor_id` 标签广播,前端按当前选中反应器过滤

### 4.7 可观测性(Sprint 1 新增)

- **trace_id 跨系统追踪**:客户端传 `X-Trace-Id`,透传到响应头 + body + audit_logs
- **OpenAPI 交互文档**:`/api/v1/docs/` 可直接试用所有端点
- **健康检查**:`/api/v1/status` 返回 uptime + WS clients + 心跳状态
- **结构化日志**(Sprint 2 规划):pino + 按日轮转

---

## 5. 外部系统集成

### 5.1 与 MES 集成

BIOCore 不是完整的 MES,而是**可被 MES 调用的发酵控制微服务**。

**推荐的集成架构**:
```
MES (项目/立项/结项管理)
  ├─ 项目立项 → 传给 biocore 的 batch_id 作为 metadata
  ├─ 配方管理 → 通过 POST /api/v1/recipes 推送到 biocore
  ├─ 批次查询 → GET /api/v1/batches 增量拉取
  ├─ 实时监控 → WebSocket 订阅 state_update / alarm
  └─ 报告汇总 → GET /api/v1/batches/:id/report 拿批次数据
```

**关键接口**:
- **API Key 认证**:MES 申请长期 key,无需刷新 token
- **trace_id 透传**:MES 的 request_id 通过 `X-Trace-Id` 关联 biocore 操作
- **统一响应格式**:MES 客户端一套代码处理所有 v1 端点
- **WebSocket 订阅**:MES 订阅 biocore 事件,实时同步

### 5.2 与 CRM/ERP 集成(规划)

- Webhook 推送(Sprint 3):批次启停/报警时主动通知外部系统
- 采购订单对接:消耗物料(培养基/葡萄糖)自动回传 ERP
- 客户档案对接:批次归属某客户项目

### 5.3 与 LIMS 集成(规划)

- 离线取样数据双向同步
- HPLC/LC-MS 结果自动导入

---

## 6. 安全与合规

### 6.1 安全分层

1. **PLC 硬互锁**:急停按钮 I0.0 直接断电,不走软件
2. **PLC 软互锁**:互锁检查在 PLC 梯形图实现,biocore 二次验证
3. **biocore 软件校验**:`checkInterlocks()` 在启动批次前再次校验
4. **ISA-88 状态机**:禁止非法状态转换
5. **审计追踪**:所有操作留痕不可篡改
6. **AI 建议缓冲区**:AI 永远不直接写 PLC
7. **JWT + API Key 双鉴权**:细粒度权限
8. **CORS 白名单**:生产环境限制 origin
9. **trace_id 可追溯**:跨系统排错

### 6.2 合规性

- **非 GMP** 定位(研发 R&D 用)
- **审计日志保留**:永久不删除
- **数据本地化**:不依赖任何云服务
- **可追溯性**:每批次可追溯到"谁启动、什么配方、什么参数、什么状态、最后结果"

---

## 7. 部署与运维

### 7.1 开发环境

```bash
git clone <repo>
cd biocore
corepack pnpm install
cp .env.example .env  # 配置 INFLUX_TOKEN / JWT_SECRET
corepack pnpm --filter @biocore/server dev  # 后端 :3001
corepack pnpm --filter @biocore/web-ui dev  # 前端 :3000
```

默认账号:`admin / admin123`

### 7.2 生产部署

详见 [部署说明.md](./部署说明.md)。关键 checklist:
- [ ] `MOCK_PLC=false` 或删除该环境变量
- [ ] `JWT_SECRET` 改为强随机
- [ ] `ALLOWED_ORIGINS` 限制 CORS 来源
- [ ] 修改 admin 默认密码
- [ ] 配置真实 PLC 连接
- [ ] 配置 InfluxDB 生产 bucket
- [ ] Nginx/Caddy 反向代理 + TLS
- [ ] 定期自动备份 SQLite

### 7.3 系统要求

| 资源 | 最小 | 推荐 |
|---|---|---|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB(含 Ollama) |
| 磁盘 | 20 GB | 100 GB(InfluxDB 数据增长) |
| 网络 | 100 Mbps(PLC 局域网) | 1 Gbps |
| OS | Windows 10+/Linux x64 | Ubuntu 22.04 LTS |

---

## 8. 开发路线图

### Sprint 1 (完成于 2026-04-08) — API 公开化基础

- [x] umzug 数据库 migration
- [x] Express Router + /api/v1 双挂载
- [x] trace_id + 统一响应格式
- [x] API Key 认证
- [x] Swagger 文档
- [x] WebSocket 鉴权
- [x] MOCK_PLC 环境变量化
- [x] Code review + bug 修复(P0 + P1 共 14 项)

### Sprint 2 — 用户价值增强(规划)

- [ ] 趋势图 ECharts + LTTB 下采样
- [ ] 多批次叠加对比(按发酵经过时间对齐)
- [ ] 批次报告 PDF 导出
- [ ] 离线检测录入 UI 增强
- [ ] 审计日志查看页
- [ ] 登录页 token 自动刷新

### Sprint 3 — MES 集成接口(规划)

- [ ] Webhook 推送(batch 事件)
- [ ] 批次 metadata 回填接口
- [ ] 数据批量拉取接口
- [ ] 健康检查细化
- [ ] Rate limit(API Key 级)

### Sprint 4 — 工程化(规划)

- [ ] server/index.ts 拆分模块化
- [ ] supertest API 集成测试补强
- [ ] Dockerfile + docker-compose.prod.yml
- [ ] 实机 PLC 联调
- [ ] 结构化日志(pino)

### 长期规划

- [ ] ONNX 软测量训练 pipeline
- [ ] 多租户支持(Sprint 5+)
- [ ] 移动端监控(Sprint 6+)
- [ ] 国际化(中英文切换)

---

## 9. 对比与定位

### 9.1 与 Eppendorf BioFlo 对比

| 特性 | Eppendorf BioFlo 320 | BIOCore |
|---|---|---|
| 硬件成本 | ~¥180k | ~¥30k (S7-200 SMART) |
| 软件成本 | 含在硬件中 | 开源免费 |
| 最大反应器数 | 单罐独立 | 单 PC 1-8 罐 |
| 数据导出 | XML/CSV | JSON/CSV + InfluxDB/SQLite 直接访问 |
| 可定制 | 封闭 | 全开源 |
| AI 集成 | 无 | 本地 LLM + ONNX 软测量 |
| API 开放 | 有限 | REST + WebSocket + OpenAPI |
| 合规审计 | 部分 | 不可篡改触发器 |

### 9.2 与 Sartorius BioSTAT 对比

类似,BIOCore 成本优势 + AI + 开源。不适用于 **GMP 生产级别**(这是 Sartorius 强项)。

### 9.3 目标市场

- ✅ 高校发酵实验室(经费敏感)
- ✅ 合成生物学初创(需要快速迭代工艺)
- ✅ 代工厂 R&D 部门(需要 AI 辅助优化)
- ❌ GMP 生产车间(需要商业化系统)
- ❌ 大型药企(会倾向 SCADA + MES 大厂方案)

---

## 10. 相关文档

| 文档 | 用途 |
|---|---|
| [API_REFERENCE.md](./API_REFERENCE.md) | 完整 97 端点 API 参考 |
| [API_INTEGRATION.md](./API_INTEGRATION.md) | MES 集成指南 |
| [WS_PROTOCOL.md](./WS_PROTOCOL.md) | WebSocket 协议规范 |
| [部署说明.md](./部署说明.md) | 生产部署 checklist |
| [00_BIOCore_产品规划主文档.md](./00_BIOCore_产品规划主文档.md) | 产品定位 + 商业模型 |
| [01_PLC硬件规格.md](./01_PLC硬件规格.md) | P&ID + I/O 分配 + V 区映射 |
| [02_AI架构.md](./02_AI架构.md) | 本地 AI 设计详解 |
| [03_工艺控制策略.md](./03_工艺控制策略.md) | 4 种 DO 策略 + 补料算法 |
| [04_配方JSON规范.md](./04_配方JSON规范.md) | 配方文件格式 |
| [05_数据库Schema详设.md](./05_数据库Schema详设.md) | 完整表定义 |
| [06_ISA-88状态机规格.md](./06_ISA-88状态机规格.md) | 状态机详解 |
| [07_前端UI规格.md](./07_前端UI规格.md) | 页面结构 |
| [开发进度_Sprint1_API公开化.md](./开发进度_Sprint1_API公开化.md) | Sprint 1 进度跟踪 |

---

**文档版本**: v1.0
**发布日期**: 2026-04-08
**对应代码版本**: BIOCore Sprint 1 完成版 (含 Code Review 修复)
**许可证**: MIT (社区版)
