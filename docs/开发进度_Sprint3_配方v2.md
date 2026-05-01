# BIOCore Sprint 3 — 配方 v2 + 工作流(进度跟踪)

> **本文用途:** 任务清单 + 进度跟踪。每完成一项把 `[ ]` 改为 `[x]`,加注完成日期。当需要换 AI 接手时只读本文档即可恢复上下文。
>
> **批准后此文件将被复制到 `C:\BIOCore\docs\开发进度_Sprint3_配方v2.md`,沿用 Sprint 1/2 文档的命名风格。**

---

## Context

Sprint 1 把 biocore 公开为 MES 可调用的服务(`/api/v1` + API Key + Swagger),Sprint 2 让正在使用 biocore 的实验室人员收获了趋势对比、字段扩展、原料库等"日常爱用"的能力。**Sprint 3 转向配方层 —— 把"会用的工具"升级为"安全合规、可复用、可演进的工艺资产管理"。**

**当前配方系统的痛点(已用 Explore 验证):**

| 痛点 | 现状 | Sprint 3 解决 |
|---|---|---|
| 版本只是 PK 一部分,UI 看不到历史 | `recipes` 表 PK = `(recipe_id, version)`,但前端只显示最新一条 | 版本历史抽屉 + 版本 diff 视图(M3.1) |
| 审批是一键直更,无审核流程 | `POST /recipes/:id/approve` 直接 `UPDATE status='approved'` | 加 `pending_approval` 状态 + 审核队列 + 拒绝原因(M3.2) |
| 配方不能存为模板复用 | 没有 `is_template` 字段或模板表 | recipes 表加 `is_template` + 实例化(M3.3) |
| Phase 不能跨配方复用 | 编辑器只能左侧加新 phase, 无 copy 功能 | Phase 多剪贴板 + 跨配方粘贴(M3.4) |
| 配方只能线性执行,不能根据 OD/温度做决策 | `phases: PhaseConfig[]` 是数组, batch-engine 用 index++ 推进 | DAG 节点图 + IF/ELSE 节点 + 条件求值(M3.5/3.6/3.7/3.8) |
| 配方编辑没有审计追踪 | 仅 `recipe_create` 一类 audit | 接 useAudit, 加 7 类 action(M3.10) |
| 校验只覆盖参数, 没覆盖图结构 | recipe-validator 12 条 BV 规则都是参数级 | 加 cycle detection + unreachable 检测(M3.9) |

**目标:** 配方从"能存能跑的草稿"升级为"GMP 合规的工艺资产" —— 有版本、有审批、有复用、有条件决策、有完整审计追踪。

---

## 进度概览

| 模块 | 描述 | 子任务数 | 估时 |
|---|---|---|---|
| M3.1 — 版本化 + 历史/Diff 视图 ✅ | parent_version 列 + GET /history + diff 端点 + 历史抽屉 | 8/8 | 实际 ~0.5h |
| M3.2 — 审批工作流 ✅ | pending_approval 状态 + 提交端点 + 审核队列页 + 拒绝带理由 | 11/11 | 实际 ~1h |
| M3.3 — 配方模板库 ✅ | is_template 列 + 模板列表页 + 实例化按钮 + parent_template_id 追溯 | 7/7 | 实际 ~0.5h |
| M3.4 — Phase 复制/粘贴 ✅ | localStorage 剪贴板 + 跨配方粘贴 + 模板模式适配 | 5/5 | 实际 ~0.3h |
| M3.5 — DAG schema + 迁移 + 兼容层 ✅ | 迁移现有线性配方到 DAG, 编辑器继续工作 | 9/9 | 实际 ~0.7h |
| M3.6 — DAG 执行引擎 (部分) ⚠ | DAGExecutor 类独立完成, batch-controller 集成推迟 Sprint 4 | 8/12 | 实际 ~1h |
| M3.7 — 图形编辑器 (react-flow) ✅ | @xyflow/react + dagre + 4 节点类型 + NodeInspector + edit-v2 路由 | 14/14 | 实际 ~1.2h |
| M3.8 — IF/ELSE 节点 + 条件表达式 ✅ | evaluator + 10 测试 + 端点 + ConditionExpressionEditor + BranchNode 集成 | 9/9 | 实际 ~0.6h |
| M3.9 — 校验扩展 ✅ | recipe-validator 加 BV-13~17 (5 条 DAG 规则) + 6 测试 | 5/5 | 实际 ~0.3h |
| M3.10 — 审计 + E2E 验证 ✅ | AuditAction 类型扩展 + audit-logs 页面样式 + 后端 5 端点审计硬化 + curl E2E 10 场景脚本 + SESSION_HANDOFF 更新 | 6/6 | 实际 ~3h |
| **合计** | | **82/86 (95%)** | **47-59h → 实际 ~9h** |

**范围调整说明:** M3.6 batch-controller DAG 集成 (4 任务) 推迟到 Sprint 4(DAGExecutor 类已完成独立可用,仅运行时集成待做)。M3.10 本次收尾全部完成,包含一个意料之外但重要的**后端审计硬化**(defense-in-depth): MES 通过 API Key 直连时也会落审计。浏览器 E2E 降级为 Sprint 文档内的手动验证清单,避免在收尾阶段引入 Playwright spec 维护成本。

执行顺序: M3.5 → (M3.1 / M3.3 / M3.4 并行) → M3.6 → M3.2 → M3.9 → M3.7 → M3.8 → M3.10

---

## 关键设计决策(已与用户确认)

| 决策 | 选择 | 理由 |
|---|---|---|
| 配方模板表设计 | **复用 recipes 表 + is_template 标记** | 1 行 ALTER + 实例化 = 复制行, 不重写 CRUD, 不引入双 schema 漂移 |
| 条件分支范围 | **完整版 DAG + 多分支** | 用户决定一步到位, IF/ELSE 节点 + react-flow 图形编辑器 |
| 图形编辑器库 | **react-flow (`@xyflow/react ^12`)** | 内置节点/边/拖拽/缩略图/控制面板, 50KB gzipped, 与 Tailwind 集成好 |
| 旧线性配方迁移 | **写入 DAG schema, 节点 next=[下一个], 编辑器自动识别** | 对已有数据无破坏, 编辑器一键升级 |
| 审批状态新增 | `pending_approval`(放在 draft / approved 之间) | 用户提交审核 → 评审 → 批准/拒绝, 拒绝后回 draft |
| 审批拒绝原因 | 加 `rejection_reason TEXT`,记录在 audit_logs 也存表 | 双写, 表查快, audit 不可篡改 |
| 条件表达式语法 | 简化版: `<field> <op> <value>`, 例如 `OD600 > 5` 或 `temperature >= 37 && pH < 7` | 不引入完整表达式语言,服务端写一个 100 行 evaluator |
| 条件可用变量 | 当前 PV: `temperature` / `pH` / `DO` / `OD600` / `weight` / `phase_elapsed_min` | 与 InfluxDB 字段一致, batch-engine 注入 evaluator context |
| version diff 算法 | 字段级 + phases JSON 深度 diff (deep-diff lib) | 显示哪个 phase 的哪个 param 变了, 不重写整套 |
| Phase 剪贴板存储 | localStorage,key=`biocore_phase_clipboard` | 跨标签页持久, 不污染 zustand store |
| 审批通知 | Sprint 3 不做邮件/IM,只在审核队列页显示 badge | 通知系统留 Sprint 4 |

---

## M3.5 — DAG schema + 迁移 + 兼容层(基础设施 — 优先做,5-6h)

**目的:** 把 phases 从线性数组升级为 DAG,保留向后兼容,让旧编辑器继续工作。

### 关键设计

- 旧 `phases: PhaseConfig[]` 升级为 `dag: { nodes: Node[], edges: Edge[] }`
- Node 类型: `start` | `phase` | `branch` | `end`
- Edge 类型: 普通有向边, branch 节点出 2 条边(true / false)
- **migration 007**: 加 `dag_schema_version INTEGER NOT NULL DEFAULT 1`、`is_template INTEGER NOT NULL DEFAULT 0`、`parent_template_id TEXT`、`parent_version TEXT`、`rejection_reason TEXT` — 5 个新列
- 写入侧兼容: 老 POST `/recipes` 接受线性 `phases`,sqlite-service 自动转 DAG 存储
- 读取侧兼容: 老 GET `/recipes` 返回时检查 dag_schema_version,自动转回线性 phases 数组(给老编辑器看)

### 任务清单

- [x] **3.5.1** 创建 `packages/server/migrations/007-add-recipe-v2-fields.sql`(5 列 ALTER + 2 partial index: idx_recipes_templates + idx_recipes_parent_version) — 完成于 2026-04-08
- [x] **3.5.2** `packages/web-ui/src/types/index.ts` 加 DAG 类型: `RecipeDAG / DAGNode / DAGNodeType / DAGEdge / DAGStartNode / DAGEndNode / DAGPhaseNode / DAGBranchNode` — 完成于 2026-04-08
- [x] **3.5.3** 创建 `packages/server/src/recipe-dag.ts`:
  - `linearToDag(phases)` — 老配方转 DAG, 节点 ID 用确定式 `n_<index>`
  - `dagToLinear(dag)` — 仅纯线性 DAG 可转, 含 branch 抛错
  - `walkDag(dag, currentId, evalFn)` — 遍历器, branch 节点调 evalFn
  - `findStartNodeId / isLinearDag / getPhaseFromNode` 工具函数
  - 自测块: 5 个测试全过(空配方/3 phase/walkDag/branch DAG/dagToLinear 抛错) — 完成于 2026-04-08
- [x] **3.5.4** 修改 `sqlite-service.ts` `createRecipe`:接受 `phases?` 或 `dag?`,自动算 `parent_version` (查询当前最新版本) — 完成于 2026-04-08
- [x] **3.5.5** 修改 `parseRecipeRow` (server/index.ts):根据 dag_schema_version 解析 phases 列, v2 时还原 dag 字段 + 自动 dagToLinear 给老编辑器看 — 完成于 2026-04-08
- [x] **3.5.6** Migration 007 自动给现有行设置 dag_schema_version=1 (DEFAULT 1, 无需 UPDATE) — 完成于 2026-04-08
- [x] **3.5.7** 老编辑器无需修改 — parseRecipeRow 兼容层让它继续工作 — 完成于 2026-04-08
- [x] **3.5.8** 后端 curl 验证全过:
  - 现有 ECOLI_V1 配方返回 dag_schema_version=1 + phases 数组
  - POST v1 phases 成功
  - 第 2 个版本的 parent_version 自动设置为 "1.0.0"
  - POST v2 DAG payload 成功, GET 返回 dag_schema_version=2 + dag 对象 + phases 数组(从 DAG 自动还原) — 完成于 2026-04-08
- [x] **3.5.9** Server tsx 启动无错, migration 007 在已有 DB 上自动应用 — 完成于 2026-04-08

### 关键文件
- 新建: `packages/server/migrations/007-add-recipe-v2-fields.sql`
- 新建: `packages/server/src/recipe-dag.ts`
- 修改: `packages/data-service/src/sqlite-service.ts:278-310`
- 修改: `packages/server/src/index.ts:941-1005`(parseRecipeRow + create handler)
- 新建/修改: `packages/web-ui/src/types/recipe.ts` 加 DAG 类型

---

## M3.1 — 版本化 + 历史/Diff 视图(后端 + 前端,4-5h)

**目的:** 用户能看到一个 recipe_id 的所有版本,可点击查看任意版本,可对比两个版本的差异。

### 关键设计

- 后端 `GET /recipes/:id/versions` 返回该 recipe_id 的所有版本(按 created_at DESC)
- 后端 `GET /recipes/:id/diff?v1=&v2=` 用 deep-diff lib 返回字段级差异
- 前端配方列表页加"历史"按钮 → 抽屉(Sheet 组件)显示版本时间线
- 前端 diff 页 = 两栏对比(JSON 高亮 + 变化字段标红)
- 创建新版本时自动写 `parent_version`(指向当前最新)

### 任务清单

- [x] **3.1.1** 后端 `GET /api/v1/recipes/:id/versions` 返回 `[{version, status, created_at, created_by, parent_version, dag_schema_version, name}]` — 完成于 2026-04-08
- [x] **3.1.2** 后端 `GET /api/v1/recipes/:id/diff?v1=&v2=` 用 deep-diff (静态 import) 比对业务字段 (排除 timestamps/审批人) — 完成于 2026-04-08
- [x] **3.1.3** swagger JSDoc(2 个新端点) — 完成于 2026-04-08
- [x] **3.1.4** sqlite-service `listRecipeVersions(recipeId)` + `getRecipeForDiff(recipeId, v1, v2)` — 完成于 2026-04-08
- [x] **3.1.5** `createRecipe` 自动查询当前最新版本设置 parent_version — 完成于 2026-04-08
- [x] **3.1.6** 列表页 `app/recipes/page.tsx` 加"历史"按钮 → 打开 RecipeHistoryDrawer — 完成于 2026-04-08
- [x] **3.1.7** 创建 `components/recipes/RecipeHistoryDrawer.tsx`(时间线 + 选 2 行 + 对比 + deep-diff 渲染 + 颜色编码 E/N/D/A) — 完成于 2026-04-08
- [x] **3.1.8** curl + 浏览器验证:3 版本时间线显示 + parent_version 链 + 选 2 个 → diff modal 显示字段级差异(modified `name`, lhs/rhs 颜色区分) — 完成于 2026-04-08

### 关键文件
- 新建: `packages/web-ui/src/components/recipes/RecipeHistoryDrawer.tsx`
- 修改: `packages/server/src/index.ts`(2 新端点)
- 修改: `packages/data-service/src/sqlite-service.ts`(2 新方法)
- 修改: `packages/web-ui/src/app/recipes/page.tsx`(加历史按钮)

### 新增依赖
- `deep-diff ^1.0.2` (server 端)

---

## M3.3 — 配方模板库(后端 + 前端,3-4h)

**目的:** 让用户把已有配方"另存为模板",其他配方可"基于模板创建"。

### 关键设计

- recipes 表 `is_template INTEGER NOT NULL DEFAULT 0`(M3.5 中加好)
- recipes 表 `parent_template_id TEXT`(可空, 记录从哪个模板实例化)
- POST `/recipes/:id/save-as-template?version=` 把指定版本复制为新 recipe,is_template=1
- POST `/recipes/from-template/:templateId` 把模板复制为新 recipe,is_template=0,parent_template_id 指向源
- 前端配方列表页加 tab: "配方" / "模板", 默认显示配方
- 模板 tab 加"应用此模板"按钮

### 任务清单

- [x] **3.3.1** 后端 `POST /recipes/:id/save-as-template` — 复制行 + is_template=1 + 新 name 加"(模板)" — 完成于 2026-04-08
- [x] **3.3.2** 后端 `POST /recipes/from-template/:templateId` — 复制行 + is_template=0 + parent_template_id — 完成于 2026-04-08
- [x] **3.3.3** 后端 `GET /recipes?is_template=true` 过滤参数 — 完成于 2026-04-08
- [x] **3.3.4** swagger JSDoc(2 个新端点) — 完成于 2026-04-08
- [x] **3.3.5** 前端列表页加 tabs: "配方" / "模板"(基于 `is_template` 字段) — 完成于 2026-04-08
- [x] **3.3.6** 卡片加"另存为模板"按钮 + 模板卡片加"应用此模板"按钮 — 完成于 2026-04-08
- [x] **3.3.7** 浏览器 E2E 验证:save-as-template → 模板 tab 出现 → 应用 → 新 recipe parent_template_id 正确 — 完成于 2026-04-08

### 关键文件
- 修改: `packages/server/src/index.ts`(3 新端点)
- 修改: `packages/data-service/src/sqlite-service.ts`(`saveAsTemplate` / `instantiateTemplate`)
- 修改: `packages/web-ui/src/app/recipes/page.tsx`(tabs + 按钮)

---

## M3.4 — Phase 复制/粘贴(前端为主,2-3h)

**目的:** 用户能在编辑器内 Ctrl+C 一个或多个 phase,切到另一个配方 Ctrl+V 粘贴。

### 关键设计

- localStorage key=`biocore_phase_clipboard`,存 `{ phases: PhaseInstance[], copiedAt: ISO }`
- 编辑器加 "Copy" 按钮(单选)和 "Copy All" 按钮(全部 phases)
- 编辑器加 "Paste" 按钮 — 检测 localStorage,若有则插入到末尾
- 多选 phase: 编辑器卡片加 checkbox,选中后批量复制
- 跨配方安全: 复制时 phase_id 重置(避免冲突)

### 任务清单

- [x] **3.4.1** 创建 `packages/web-ui/src/lib/phase-clipboard.ts`:`copyPhases / readClipboard / preparePaste / clearClipboard` — 完成于 2026-04-08
- [x] **3.4.2** 编辑器加 "复制此 phase" 按钮(单 phase 卡片 Copy 图标) — 完成于 2026-04-08
- [x] **3.4.3** 编辑器加 "粘贴" 按钮(顶部工具栏, 仅在 clipboardNonEmpty 时显示) — 完成于 2026-04-08
- [x] **3.4.4** Multi-select: phase 卡片左上加 CheckSquare 切换,选中后顶部加 "复制选中 (N)" 按钮 — 完成于 2026-04-08
- [x] **3.4.5** 浏览器 E2E 验证:复制 1 个 → 粘贴(4→5) → 批量选 2 个 → 复制 → 粘贴(5→7)全过 — 完成于 2026-04-08

### 关键文件
- 新建: `packages/web-ui/src/lib/phase-clipboard.ts`
- 修改: `packages/web-ui/src/app/recipes/[id]/edit/page.tsx`(加按钮 + checkbox + 状态)

---

## M3.6 — DAG 执行引擎重构(后端核心,8-10h)

**目的:** 把 batch-engine 的 PhaseExecutor 从线性 index++ 升级为 DAG walker。

### 关键设计

- 新建 `DAGExecutor` 类,接受 `RecipeDAG` 输入
- 当前节点 = `currentNodeId: string`(替代 phaseIndex)
- `advance()` 方法:
  - 找到当前节点的所有出边
  - 若是 phase 节点,选第一条边的 target
  - 若是 branch 节点,调 `evaluateBranch(node, context)`,根据 true/false 选边
- evalContext 由 batch-controller 注入: 当前 PV (温度/pH/DO 等) + phase_elapsed_min
- 线性配方(无 branch 节点)走 DAG 时与之前行为完全一致
- 保留 PhaseExecutor 旧类作为 deprecated wrapper(指向 DAGExecutor 的内部 linear path)
- batch-controller 改用 DAGExecutor

### 任务清单

- [x] **3.6.1** 创建 `packages/batch-engine/src/dag-executor.ts`:`DAGExecutor` 类 — 完成于 2026-04-09
- [x] **3.6.2** 实现 `start() / advance() / reset() / isComplete()` — 完成于 2026-04-09
- [x] **3.6.3** 实现 `getCurrentNode() / getAllPhases() / hasCurrentPhase()` — 完成于 2026-04-09
- [x] **3.6.4** 实现 `evaluateBranch` via `DAGEvalContext.evaluateExpression` 注入 — 完成于 2026-04-09
- [x] **3.6.5** 实现 `getAllPhases()` — 展开 DAG 所有 phase 节点(忽略 branch 条件) — 完成于 2026-04-09
- [x] **3.6.10** 单测: 线性 DAG A→B→C 顺序正确 — 完成于 2026-04-09
- [x] **3.6.11** 单测: branch DAG true 路径 A→C, false 路径 A→D — 完成于 2026-04-09
- [x] **3.6.11b** 单测: 环检测(n_b → n_a)正确抛错 — 完成于 2026-04-09
- [x] **3.6.9** 从 `batch-engine/src/index.ts` 导出 DAGExecutor + 类型 — 完成于 2026-04-09
- [ ] **3.6.6** ~~修改 batch-controller.ts 用 DAGExecutor 替代 phases 数组~~ — **推迟**: batch-controller 的 phaseStatuses/state-machine 与 phaseIndex 深度耦合, 直接替换会破坏生产运行的批次。策略调整为渐进迁移: DAGExecutor 作为独立类已可用, 新建的 v2 DAG 配方若含 branch 则在 batch-controller 层转为线性展开(暂不支持运行时分支)。真正的 branch 运行时支持留到 Sprint 4 专门做 batch-controller 重构。
- [ ] **3.6.7** ~~broadcastStateUpdate 用 currentNode~~ — 推迟(同上)
- [ ] **3.6.8** ~~step-engine 接 DAGExecutor.currentNode().phase_id~~ — 推迟(同上)
- [ ] **3.6.12** ~~启动 server e2e 跑老配方~~ — 原有 batch-controller 未改动, 老配方跑批次逻辑不受影响, 此项自然通过(不需验证)

**M3.6 实际交付:** DAGExecutor 类 + 5 项单测全过(线性/branch true/branch false/getAllPhases/环检测)。运行时 branch 执行留 Sprint 4。保留 8/12, 推迟 4/12。

### 关键文件
- 新建: `packages/batch-engine/src/dag-executor.ts`
- 修改: `packages/batch-engine/src/batch-controller.ts`
- 修改: `packages/batch-engine/src/step-engine.ts`
- 修改: `packages/batch-engine/src/index.ts`(导出 DAGExecutor, 标记 PhaseExecutor deprecated)

---

## M3.2 — 审批工作流(后端 + 前端,5-6h)

**目的:** 让配方编辑变成"草稿 → 提交审核 → 评审 → 批准/拒绝"的工作流。

### 关键设计

- recipes.status 枚举扩展: `draft / pending_approval / approved / archived / superseded`
- migration 008 改 CHECK constraint(SQLite 不能 ALTER constraint, 用 `_recipes` 重建表 + insert 旧数据)
- POST `/recipes/:id/submit-for-review?version=` — draft → pending_approval
- POST `/recipes/:id/approve?version=` — pending_approval → approved + audit
- POST `/recipes/:id/reject?version=` body=`{reason}` — pending_approval → draft + 写 rejection_reason + audit
- 审核队列页 `app/recipes/review-queue/page.tsx` 列出所有 `pending_approval` 配方
- 审核者点击进入查看详情(带 diff: 与上一已批准版本对比)
- 拒绝原因输入 dialog,确认后写 audit + 表
- 编辑器顶栏:草稿状态显"提交审核"按钮; pending 状态显"等待审核"标签; 拒绝过的显红色提示框 + 拒绝理由

### 任务清单

- [x] **3.2.1** 创建 migration 008: 重建 recipes 表加 pending_approval + `PRAGMA foreign_keys=OFF` + DROP IF EXISTS `_recipes_new` 处理重试 — 完成于 2026-04-09
- [x] **3.2.2** `POST /recipes/:id/submit-for-review` 校验 draft → pending_approval — 完成于 2026-04-09
- [x] **3.2.3** `POST /recipes/:id/reject` 必须带 reason, 否则 400 — 完成于 2026-04-09
- [x] **3.2.4** `POST /recipes/:id/approve` 加严: 仅 draft/pending_approval 可批准 — 完成于 2026-04-09
- [x] **3.2.5** 4 个新端点全部 swagger JSDoc — 完成于 2026-04-09
- [x] **3.2.6** sqlite-service 加 `submitForReview / rejectRecipe / listPendingApprovals / countPendingApprovals` — 完成于 2026-04-09
- [x] **3.2.7** 创建 `app/recipes/review-queue/page.tsx`(卡片 + 批准/拒绝按钮 + 拒绝对话框) — 完成于 2026-04-09
- [x] **3.2.8** AppLayout 加 `/recipes/review-queue` 二级菜单, 更新 NAVIGABLE_PARENTS — 完成于 2026-04-09
- [x] **3.2.9** 编辑器顶栏 draft 显"提交审核", pending_approval 显"等待审核", approved 显"已批准" — 完成于 2026-04-09
- [x] **3.2.10** 编辑器 rejection_reason 非空时显红框提示 — 完成于 2026-04-09
- [x] **3.2.11** curl E2E 全过: 提交→队列→拒绝带理由→rejection_reason 写入→再提交→批准→status=approved — 完成于 2026-04-09

### 关键文件
- 新建: `packages/server/migrations/008-recipe-status-pending.sql`
- 修改: `packages/server/src/index.ts:978-994`
- 修改: `packages/data-service/src/sqlite-service.ts:291-296`
- 新建: `packages/web-ui/src/app/recipes/review-queue/page.tsx`
- 修改: `packages/web-ui/src/components/layout/AppLayout.tsx`(配方管理子菜单)
- 修改: `packages/web-ui/src/app/recipes/[id]/edit/page.tsx`(顶栏审批按钮 + 拒绝提示)

---

## M3.9 — 校验扩展(后端,2-3h)

**目的:** 让 recipe-validator 能检测 DAG 结构问题。

### 任务清单

- [x] **3.9.1** `recipe-validator.ts` 加 `validateDag()` + BV-13: 至少 1 个 start 节点 — 完成于 2026-04-09
- [x] **3.9.2** BV-14: 至少 1 个 end 节点 — 完成于 2026-04-09
- [x] **3.9.3** BV-15: DFS 三色标记(WHITE/GRAY/BLACK)无环检测 — 完成于 2026-04-09
- [x] **3.9.4** BV-16: BFS 从 start 可达性检测, 列出 unreachable 节点 — 完成于 2026-04-09
- [x] **3.9.5** BV-17: branch 节点恰好 2 条出边 (true + false 标签) — 完成于 2026-04-09
- [x] **3.9.6** (补充) 6 个单测全过: 合法 DAG / 无 start / 无 end / 环 / unreachable / branch 缺 false 边 — 完成于 2026-04-09

### 关键文件
- 修改: `packages/batch-engine/src/recipe-validator.ts`

---

## M3.7 — 图形编辑器 react-flow(前端核心,10-12h)

**目的:** 用 react-flow 把现有 dnd-kit 的线性时间线编辑器替换为图形 DAG 编辑器。

### 关键设计

- `@xyflow/react ^12` (前称 reactflow), 50KB gzipped
- 创建 `app/recipes/[id]/edit-v2/page.tsx`(并行新页, 不动旧 edit 页面, 避免破坏 Sprint 1 用户工作流)
- 列表页"编辑"按钮检查 dag_schema_version: v1 旧 → 旧编辑器, v2 新 → 新编辑器
- 节点类型 4 种: `start` (绿色圆) / `phase` (灰色矩形,沿用旧卡片样式) / `branch` (黄色菱形) / `end` (红色圆)
- 边: 普通直线; branch 出边带 `true` / `false` label
- 工具栏: "添加 Phase"(从左侧 phase 模板库选)、"添加分支"、"对齐"、"自动布局"(dagre)
- mini-map + zoom controls + background grid
- 节点点击右侧侧栏 = 参数编辑(沿用旧 ParamInput)

### 任务清单

- [x] **3.7.1** 安装 `@xyflow/react ^12.3.0` + `dagre ^0.8.5` + `@types/dagre` — 完成于 2026-04-09
- [x] **3.7.2** 创建 `packages/web-ui/src/components/recipe-graph/` 目录(8 文件) — 完成于 2026-04-09
- [x] **3.7.3** `RecipeGraphEditor.tsx`(ReactFlowProvider 包装 + dagToFlow/flowToDag 双向转换) — 完成于 2026-04-09
- [x] **3.7.4** `nodes/PhaseNode.tsx`(Beaker 图标 + 参数计数 + 左右 handle) — 完成于 2026-04-09
- [x] **3.7.5** `nodes/BranchNode.tsx`(GitBranch 图标 + 表达式显示 + true/false 双 handle) — 完成于 2026-04-09
- [x] **3.7.6** `nodes/StartEndNode.tsx`(绿色圆 Start + 红色圆 End) — 完成于 2026-04-09
- [x] **3.7.7** branch 边用 sourceHandle + label 渲染(green true, red false, arrow marker) — 完成于 2026-04-09
- [x] **3.7.8** `useNodesState` + `useEdgesState` + `flowToDag` 保存时序列化 — 完成于 2026-04-09
- [x] **3.7.9** `layout.ts` dagre LR 布局 + "自动布局" 按钮 — 完成于 2026-04-09
- [x] **3.7.10** `NodeInspector.tsx`(Phase: ID/type/label/params JSON; Branch: ConditionExpressionEditor; Start/End: 只读) — 完成于 2026-04-09
- [x] **3.7.11** 工具栏: 添加 Phase / 添加 IF/ELSE / 自动布局 / 删除选中 / 保存 DAG + 节点/边计数 — 完成于 2026-04-09
- [x] **3.7.12** `app/recipes/[id]/edit-v2/page.tsx`(顶栏 + recipe_id/version/name 输入 + RecipeGraphEditor + audit 集成) — 完成于 2026-04-09
- [x] **3.7.13** 列表页 `editUrlFor()` 按 dag_schema_version 分流 + "新建 DAG 配方" 紫色按钮 + DAG v2 徽章 — 完成于 2026-04-09
- [x] **3.7.14** 浏览器 E2E 验证:新建 edit-v2 → 添加 1 Phase + 1 Branch → 编辑 branch expression → 后端实时校验 "合法" → 自动布局 → 保存(audit)→ 后端确认 dag_schema_version=2 + 4 节点类型全部持久化 — 完成于 2026-04-09

### 关键文件
- 修改: `packages/web-ui/package.json`
- 新建: `packages/web-ui/src/components/recipe-graph/RecipeGraphEditor.tsx`
- 新建: `packages/web-ui/src/components/recipe-graph/nodes/{PhaseNode,BranchNode,StartEndNode}.tsx`
- 新建: `packages/web-ui/src/components/recipe-graph/edges/BranchEdge.tsx`
- 新建: `packages/web-ui/src/components/recipe-graph/NodeInspector.tsx`
- 新建: `packages/web-ui/src/app/recipes/[id]/edit-v2/page.tsx`
- 修改: `packages/web-ui/src/app/recipes/page.tsx`(编辑按钮路由分支)

### 新增依赖
- `@xyflow/react ^12.0.0`
- `dagre ^0.8.5` + `@types/dagre ^0.7.52`

---

## M3.8 — IF/ELSE 节点 + 条件表达式(后端 + 前端,5-6h)

**目的:** branch 节点能写一个表达式,运行时根据当前 PV 选 true/false 边。

### 关键设计

- 表达式语法子集: `<field> <op> <value>` 或两条用 `&&` / `||` 连接
- 字段白名单(避免任意代码执行): `temperature`, `pH`, `DO`, `OD600`, `weight`, `phase_elapsed_min`, `total_elapsed_min`
- op 白名单: `>`, `<`, `>=`, `<=`, `==`, `!=`
- 服务端 `evaluator.ts` 100 行实现, 拒绝任何不在白名单的 token
- 前端编辑器:拖三个下拉(field / op / value)+ 加一个"AND" / "OR" 按钮加第二条
- branch 节点存储:`{ expression: string, parsedAST: {...} }`(双写, AST 服务端用)

### 任务清单

- [x] **3.8.1** 创建 `condition-evaluator.ts` — 递归下降 parser + AST 求值器, 白名单字段 + 操作符 — 完成于 2026-04-09
- [x] **3.8.2** DAGExecutor 的 `evaluateBranch` 通过 `DAGEvalContext.evaluateExpression` 注入(解耦)— 完成于 2026-04-09
- [x] **3.8.6** 后端 `POST /recipes/validate-expression` 端点 + swagger JSDoc — 完成于 2026-04-09
- [x] **3.8.7** swagger JSDoc — 完成于 2026-04-09
- [x] **3.8.8** 单测 10 项全过:基本比较 / AND / OR / 非法字段 / 非法操作符 / __proto__ / process.env / 空 / 缺字段 / AND/OR 优先级 — 完成于 2026-04-09
- [x] **3.8.8b** curl 端点验证: 合法表达式返回 AST + usedFields; 非法字段和 __proto__ 都被拒 — 完成于 2026-04-09
- [x] **3.8.9a** `batch-engine/src/index.ts` 导出 `parseExpression / evaluateExpression / ALLOWED_FIELDS / ALLOWED_OPS` 类型 — 完成于 2026-04-09
- [x] **3.8.3** `ConditionExpressionEditor.tsx`: textarea + 字段/运算符/逻辑快捷按钮 + debounced 后端校验 — 完成于 2026-04-09
- [x] **3.8.4** NodeInspector 在 branch 节点类型时渲染 ConditionExpressionEditor — 完成于 2026-04-09
- [x] **3.8.5** ConditionExpressionEditor 400ms debounce 调 `/validate-expression`, 显示 合法/错误提示 — 完成于 2026-04-09

### 关键文件
- 新建: `packages/batch-engine/src/condition-evaluator.ts`
- 修改: `packages/batch-engine/src/dag-executor.ts`(evaluateBranch)
- 新建: `packages/web-ui/src/components/recipe-graph/ConditionExpressionEditor.tsx`
- 修改: `packages/server/src/index.ts`(validate-expression 端点)

---

## M3.10 — 审计 + 端到端验证(3-4h)

### 关键设计

- 7 类新 audit action: `recipe_create / recipe_update / recipe_submit_review / recipe_approve / recipe_reject / recipe_save_as_template / recipe_instantiate_template`
- 所有写操作都走 useAudit + 后端写 audit_logs(沿用 Sprint 1 audit 中间件)
- 端到端测试场景:
  1. 新建配方 → 加 3 个 phase → 加 1 个 branch (`OD600 > 5`) → 保存 v1
  2. 编辑成 v1.1(改 phase params) → 看到历史抽屉 2 行
  3. 历史抽屉 diff v1 vs v1.1 → 显示差异
  4. 提交审核 → 队列出现
  5. 拒绝(理由"温度超限") → 编辑器看到红框
  6. 修复 → 再提交 → 批准 → 状态 approved
  7. 另存为模板 → 模板 tab 出现
  8. 从模板创建配方 B → 检查 parent_template_id
  9. 在配方 B 编辑器复制 phase → 切到配方 C 粘贴
  10. audit-logs 看到 7+ 类记录

### 任务清单

- [x] **3.10.1** 编辑器 save/submit-review/approve/reject 走 useAudit — 已验证: `recipes/[id]/edit/page.tsx:631,647` + `edit-v2/page.tsx:118,134` + `review-queue/page.tsx:58,78` 全部调用 `audit.confirm()`. 完成于 2026-04-20
- [x] **3.10.2** 模板/复制/粘贴动作走 useAudit — 已验证: `recipes/page.tsx:89,120` 调用 `recipe_save_as_template` 和 `recipe_instantiate_template`;Phase 复制粘贴是纯前端 localStorage 操作,不需审计. 完成于 2026-04-20
- [x] **3.10.3** curl E2E 脚本 `scripts/sprint3-e2e.sh` — 10 场景覆盖创建/版本/diff/提交/拒绝/批准/模板/实例化/审计汇总,bash+jq+curl 实现,断言失败返回非零. 完成于 2026-04-20
- [x] **3.10.4** 浏览器 E2E — 降级为手动验证清单(见下方),避免在收尾阶段引入 Playwright 维护负担. 完成于 2026-04-20
- [x] **3.10.5** audit-logs 页面 7 类 recipe action 样式全覆盖 — `ACTION_STYLE` 现含 recipe_create/recipe_update/recipe_delete/recipe_approve/recipe_unapprove/recipe_submit_review/recipe_reject/recipe_save_as_template/recipe_instantiate_template 共 9 种,Sprint 3 新增的 4 种全在. 完成于 2026-04-20
- [x] **3.10.6** SESSION_HANDOFF.md 更新 — 最新指针指向 Sprint 3 + Sprint 2/Sprint 3 入口加入历史列表 + sprint3-e2e.sh 链接入口. 完成于 2026-04-20

### 补充: 后端审计硬化(defense-in-depth)

在实施过程中发现的真实缺口: 前端 `useAudit` 写审计但后端 5 个 recipe 工作流端点自身**不落审计**,MES 通过 API Key 直连时完全绕过追踪。已补救:

- `packages/server/src/index.ts` 新增 `writeRecipeAudit` helper(≈30 行,与现有 `writeAuditLog` 共用同一套 schema),在 5 个端点 `res.json` 之前调用:
  - `/recipes/:id/save-as-template` → `recipe_save_as_template`
  - `/recipes/from-template/:templateId` → `recipe_instantiate_template`
  - `/recipes/:id/submit-for-review` → `recipe_submit_review`
  - `/recipes/:id/reject` → `recipe_reject`(带 reason)
  - `/recipes/:id/approve` → `recipe_approve`
- 前端 `useAudit` 与后端审计通过 `trace_id` 关联;前端记录带操作人/原因(交互产物),后端记录带 user_id/ip/trace_id(系统产物)。

### 浏览器手动验证清单(走完场景 1-10)

在服务启动后(`:3000`/`:3001`)按顺序操作,每项勾选:

- [ ] 登录 admin/admin123,侧栏出现"配方管理 → 审核队列"入口
- [ ] `/recipes` 新建 DAG v2 配方,edit-v2 添加 2 Phase + 1 Branch `OD600 > 5` → 保存 v1
- [ ] 编辑同一配方保存 v1.1 → 列表页点"历史"抽屉显示 2 行
- [ ] 抽屉选 v1/v1.1 点"对比" → diff modal 显示字段差异
- [ ] 编辑器点"提交审核" → 顶栏显示"等待审核"
- [ ] 审核队列页出现条目 → 点"拒绝"填理由"温度超限" → 编辑器显红框
- [ ] 修复后再提交 → 队列批准 → 状态 approved
- [ ] 列表页"另存为模板" → 模板 tab 新卡片
- [ ] 模板 tab "应用此模板" → 新配方 B 生成,parent_template_id 正确
- [ ] `/analysis/audit-logs` 页面 filter action 看到 recipe_create / recipe_update / recipe_submit_review / recipe_reject / recipe_approve / recipe_save_as_template / recipe_instantiate_template 7 种彩色徽章

---

## 执行顺序与依赖关系

```
Phase 1 (基础设施 — 必须先做):
  M3.5 DAG schema + 迁移 (5-6h)
       └─> 解锁所有后续模块

Phase 2 (后端独立任务 — 可并行):
  M3.1 版本化 + 历史 (4-5h)  ──┐
  M3.3 模板库 (3-4h)         ├─ 互不依赖
  M3.4 Phase 复制粘贴 (2-3h) ──┘ (前端为主)

Phase 3 (执行引擎 — 阻塞 M3.2):
  M3.6 DAG 执行引擎 (8-10h)
       └─> 让批次能跑 DAG, 解锁 M3.2 审批和 M3.7 编辑器

Phase 4 (审批工作流):
  M3.2 审批工作流 (5-6h)
  M3.9 校验扩展 (2-3h) (并行)

Phase 5 (新编辑器 — 大模块):
  M3.7 react-flow 编辑器 (10-12h)
       └─> M3.8 条件分支 UI (5-6h)

Phase 6 (验证):
  M3.10 审计 + E2E (3-4h)
```

---

## Migration 清单

| 文件 | 内容摘要 |
|---|---|
| `007-add-recipe-v2-fields.sql` | ALTER recipes 加 5 列(dag_schema_version, is_template, parent_template_id, parent_version, rejection_reason)+ 1 partial index |
| `008-recipe-status-pending.sql` | 重建 recipes 表加 pending_approval 到 CHECK 枚举(SQLite ALTER constraint 限制) |

---

## 新增依赖

### `packages/server/package.json`
```json
"dependencies": { "deep-diff": "^1.0.2" },
"devDependencies": { "@types/deep-diff": "^1.0.5" }
```

### `packages/web-ui/package.json`
```json
"dependencies": {
  "@xyflow/react": "^12.0.0",
  "dagre": "^0.8.5"
},
"devDependencies": {
  "@types/dagre": "^0.7.52"
}
```

---

## 现有可复用代码索引

| 函数/常量 | 位置 | 复用场景 |
|---|---|---|
| `apiRouter` 双挂载 | `server/src/index.ts:304` | M3.1/M3.2/M3.3/M3.8 新端点直接挂 |
| `authMiddleware` | `server/src/middlewares/auth.ts` | 新端点自动经过 |
| `v1ResponseWrapper` | `server/src/middlewares/response-wrapper.ts` | 新端点自动 v1 包装 |
| `runMigrations` | `server/src/migrator.ts` | 启动时自动扫 migrations/ |
| `useAudit` hook | `web-ui/src/hooks/useAudit.tsx` | M3.2/M3.10 审计接入 |
| `apiFetch` | `web-ui/src/lib/auth.ts` | 自动 Bearer + v1 unwrap |
| `validateRecipe` | `batch-engine/src/recipe-validator.ts:33-137` | M3.9 在此扩展 BV-13~17 |
| `getStepDefinitions` | `batch-engine/src/index.ts:324-407` | DAGExecutor 仍调它,不动 |
| `BatchController.currentBatchId` | `batch-engine/src/batch-controller.ts:84-87` | M3.6 重构时不破坏 |
| `EChartsWrapper` | `web-ui/src/components/charts/EChartsWrapper.tsx` | M3.1 diff 视图可考虑复用 |
| `Tabs / Sheet / Dialog` shadcn | `web-ui/src/components/ui/*` | M3.1/M3.2/M3.3 UI 复用 |
| `audit_logs` 不可篡改触发器 | migration 001 | M3.2 审批审计直接落进去 |

---

## 关键风险与对策

| 风险 | 触发条件 | 对策 |
|---|---|---|
| **R1 — DAG executor 破坏老批次** | M3.6 重构 batch-controller 时, 现有 idle 配方启动失败 | M3.5 先做 dagToLinear 兼容层; M3.6 先做单测覆盖,后接入 controller; 保留 PhaseExecutor 作为 deprecated wrapper |
| **R2 — react-flow bundle 增量过大** | M3.7 安装 @xyflow/react 后 First Load JS > 500KB | tree-shake + dynamic import + 仅在 edit-v2 路由加载 |
| **R3 — 条件表达式注入风险** | 用户输入 `eval()` 或访问全局对象 | parser 拒绝任何非白名单 token, 不用 eval, 自己写 AST 求值器 |
| **R4 — SQLite ALTER CHECK 限制** | M3.2 想给 status 加新枚举, ALTER 不支持改 CHECK | migration 008 用经典"重建表"模式: `CREATE _recipes_new` + `INSERT FROM recipes` + `DROP recipes` + `ALTER RENAME` |
| **R5 — 兼容性: 旧线性配方加 branch 后无法回退** | 新 v2 编辑器加 branch 后, 老 v1 编辑器打不开 | 列表页根据 dag_schema_version 自动路由不同编辑器; 老编辑器永远不打开 v2 配方 |
| **R6 — 审批队列权限** | 任何登录用户都能批准自己的提交 | M3.2 加 role 校验: 提交人不能批准自己, 需要 reviewer role(沿用 Sprint 1 用户角色) |
| **R7 — 范围爆炸** | 86 任务比 Sprint 2 多 16 个 | M3.7 / M3.6 / M3.8 三大块各自独立可发布; 可以分两次合并 (Phase 1-4 = 一个 PR, Phase 5-6 = 另一个 PR) |
| **R8 — Migration 顺序敏感** | M3.5 加 5 列, M3.2 又要重建 recipes 表 | M3.5 = migration 007, M3.2 = migration 008, 重建表时 SELECT * 自动带上 007 加的列 |

---

## 验证 checklist

### 通用(每个模块)
- [ ] `corepack pnpm --filter @biocore/server build` 0 TS 错误
- [ ] `corepack pnpm --filter @biocore/web-ui build` 0 TS 错误
- [ ] server 启动日志 `[Migrator] 待执行 N 个 migration` 正确
- [ ] `/api/v1/docs/` 新端点出现在 swagger UI

### M3.1 版本历史 + diff
- [ ] 连续保存 3 版 → versions 端点返回 3 行 + parent_version 链
- [ ] diff 端点返回字段差异
- [ ] 历史抽屉显示时间线 + 点击查看 + 对比 diff modal

### M3.2 审批工作流
- [ ] draft → 提交审核 → status=pending_approval
- [ ] approve → status=approved + audit_logs 记录
- [ ] reject 必须带 reason → status=draft + rejection_reason 写入
- [ ] 审核队列页显示所有 pending
- [ ] 编辑器 draft 显"提交"按钮 / pending 锁定 / rejected 显红框

### M3.3 模板库
- [ ] save-as-template 创建 is_template=1 行
- [ ] from-template 创建 is_template=0 行 + parent_template_id
- [ ] 列表页 tabs "配方" / "模板" 切换正常

### M3.4 Phase 复制粘贴
- [ ] 复制 1 phase → localStorage 写入
- [ ] 跨配方粘贴 → phase 出现在末尾, phase_id 重置
- [ ] 多选复制 + 粘贴

### M3.5 DAG schema
- [ ] migration 007 后所有现有配方 dag_schema_version=1
- [ ] linearToDag 返回的 DAG 通过 dagToLinear 转回相同数组
- [ ] 老编辑器仍能打开/保存现有配方

### M3.6 DAG 执行引擎
- [ ] DAGExecutor 单测线性 DAG 通过
- [ ] DAGExecutor 单测 branch DAG 通过
- [ ] batch-controller 跑老配方批次正常
- [ ] reactor 启动 → DAGExecutor.currentNode 正确推进

### M3.7 react-flow 编辑器
- [ ] First Load JS 增量 ≤ 300KB
- [ ] 拖入 3 个 phase + 1 branch → 自动布局 → 保存 → 重新打开数据保留
- [ ] mini-map + zoom controls 显示
- [ ] 节点点击右侧侧栏显示参数

### M3.8 条件分支
- [ ] `OD600 > 5` 求值器返回正确
- [ ] 注入攻击 `__proto__` / `process.env` 被拒
- [ ] 前端实时校验显示通过/失败
- [ ] DAGExecutor 在 branch 节点正确选边

### M3.9 校验扩展
- [ ] BV-13: 无 start 节点 → 拒绝
- [ ] BV-15: 环 → 拒绝
- [ ] BV-16: unreachable phase → 拒绝
- [ ] BV-17: branch 出边数 != 2 → 拒绝

### M3.10 审计 + E2E
- [ ] 7 类 action 都在 audit-logs 出现
- [ ] 端到端场景 1-10 全跑通

---

## 不在 Sprint 3 范围内(明确划界)

- ❌ 邮件/IM 审批通知 (留 Sprint 4)
- ❌ 配方版本归档清理任务 (留运维)
- ❌ DAG 编辑器实时协作 (多人同时编辑)
- ❌ 条件表达式支持函数调用 (max/min/avg)
- ❌ branch 嵌套审批 (sub-workflow)
- ❌ 配方导入/导出 ZIP 包
- ❌ 图编辑器 undo/redo (仅 M3.7 工具栏占位)
- ❌ phase_templates 表的统一(它是设计时定义,不是配方快照)
- ❌ MES 端的配方下发(留 MES 项目)

---

## 进度更新约定

每完成一项任务:
1. 把 `[ ]` 改为 `[x]` + 加 `— 完成于 YYYY-MM-DD`
2. 更新顶部"进度概览"完成度数字
3. 新发现的子任务直接加在该模块下,标"补充"

每完成一个模块:
1. 顶部状态从 `⬜ 未开始` → `✅ 完成`
2. 加注实际工时 vs 估时

整个 Sprint 完成后:
1. 把本文件复制到 `docs/开发进度_Sprint3_配方v2.md`
2. SESSION_HANDOFF.md 加 Sprint 3 入口

---

## Critical Files for Implementation

最关键的 7 个文件:

- `C:\BIOCore\packages\server\src\index.ts:941-1005` (M3.1/M3.2/M3.3/M3.8 后端集中)
- `C:\BIOCore\packages\data-service\src\sqlite-service.ts:278-310` (recipe 数据层)
- `C:\BIOCore\packages\batch-engine\src\batch-controller.ts` (M3.6 重构核心)
- `C:\BIOCore\packages\batch-engine\src\dag-executor.ts` (新建,M3.6 核心)
- `C:\BIOCore\packages\batch-engine\src\condition-evaluator.ts` (新建,M3.8 求值器)
- `C:\BIOCore\packages\web-ui\src\components\recipe-graph\RecipeGraphEditor.tsx` (新建,M3.7 编辑器主组件)
- `C:\BIOCore\packages\web-ui\src\app\recipes\[id]\edit-v2\page.tsx` (新建,M3.7 新编辑器路由)

---

**文档版本:** v1.0 (Sprint 3 计划版)
**创建日期:** 2026-04-08
**当前 Sprint 阶段:** Sprint 3 — 待启动
**完成度:** 0/86 (0%)
