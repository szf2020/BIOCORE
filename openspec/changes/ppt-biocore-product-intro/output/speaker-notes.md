# Speaker Notes: BIOCore 实验室发酵罐智能控制平台

## Slide 01: BIOCore 实验室发酵罐智能控制平台
**Talking Points:**
- 开场定位：用工业 PLC 的可靠性 + 本地 AI 的智能 + 开放架构的灵活性，以竞品 1/5 成本提供专业级发酵控制
- 四大核心指标快速亮出：100% 离线、ISA-88 标准、8 罐并行、1/5 成本
- 强调非 GMP R&D 实验室定位，不与 GMP 系统竞争

**Transition:** "让我们先看看 BIOCore 的整体技术架构..."
**Time:** ~1 minute

---

## Slide 02: 技术架构总览
**Talking Points:**
- 三层解耦架构：浏览器层（Next.js 前端）、Node.js 服务层（9 个后端包）、PLC 层（S7-200 SMART）
- 强调解耦设计：任一层故障不影响其他层，PLC 独立运行安全程序
- 9 个后端包各司其职：plc-driver、batch-engine、data-service、ai-gateway 等

**Transition:** "接下来深入了解硬件底座的设计..."
**Time:** ~2 minutes

---

## Slide 03: 工业级硬件底座
**Talking Points:**
- 西门子 S7-200 SMART G2：工业级 PLC，不是 Arduino/Raspberry Pi
- I/O 配置：8 路模拟输入覆盖所有关键传感器，4 路模拟输出控制执行机构
- 8 路 PID 回路：温度、搅拌、DO、pH 等独立闭环
- 硬件成本仅 ¥3,100，这是整个控制器的成本

**Transition:** "可靠的硬件需要可靠的通讯保障..."
**Time:** ~2 minutes

---

## Slide 04: 双向心跳安全协议
**Talking Points:**
- 核心创新：PC 和 PLC 互相监控，不是单向检测
- PC 每秒写 VB400 计数器，PLC 每秒写 VB401 计数器
- 任一方 3 秒无响应 → 自动保护
- 关键：即使 PC 完全崩溃，PLC 仍维持搅拌 + 温控 + pH 控制
- 丢包率 < 0.01%

**Transition:** "有了可靠的通讯，我们来看批次控制引擎..."
**Time:** ~2 minutes

---

## Slide 05: ISA-88 批次控制引擎
**Talking Points:**
- ISA-88 是国际批次控制标准，BIOCore 严格遵循
- 6 状态机：Idle → Running ⇄ Paused/Held → Stopped → Complete
- 14 种 Phase 类型覆盖从准备到清洗灭菌的全流程
- 3 种执行模式：顺序（成熟工艺）、自由（摸索阶段）、DAG 分支（智能路由）
- DAG 模式支持条件分支，如 "OD600 > 5 则切换补料策略"

**Transition:** "状态机之上，我们建立了 5 层安全防护..."
**Time:** ~2 minutes

---

## Slide 06: 5 层安全防护体系
**Talking Points:**
- 洋葱式纵深防御，层层递进
- L1 启动互锁：10 项检查全部通过才能启动（传感器、VFD、急停、盖锁等）
- L2 运行监测：11 项故障自动检测（温度偏差、pH 失控、DO 过低等）
- L3 心跳保护：双向监控，3 秒超时
- L4 PLC 独立：上位机失联时 PLC 独立运行安全程序
- L5 AI 缓冲：AI 建议永不直接写 PLC

**Transition:** "安全的底座之上，我们部署了本地 AI..."
**Time:** ~2 minutes

---

## Slide 07: 本地 AI 技术栈
**Talking Points:**
- Ollama + Qwen2.5-7B：4.5GB 内存即可运行，完全离线
- 8 大 AI 模块：LLM 对话、CUSUM 预警、DTW 匹配、软测量、补料优化、根因分析、事件检测、代谢推断
- 零云依赖意味着：数据不出实验室、无网络要求、无 API 费用、无延迟波动
- 对于涉及专利菌株和工艺参数的实验室，数据主权至关重要

**Transition:** "但 AI 再智能，也不能直接控制 PLC..."
**Time:** ~2 minutes

---

## Slide 08: AI 安全哲学 — 建议缓冲区
**Talking Points:**
- 核心设计原则：AI 是顾问，不是操作员
- 流程：AI 推理 → 生成建议（含置信度+理由）→ 写入缓冲区 → 操作员审核 → 接受后才执行
- AI 永远不能直接写 PLC，这是写在代码架构里的硬约束
- 对比其他系统：Sartorius 的云 AI 可能自动调参，安全风险更高
- 审计日志不可篡改（SQLite 触发器保护）

**Transition:** "让我们看看 AI 的具体算法能力..."
**Time:** ~1.5 minutes

---

## Slide 09: CUSUM 异常检测与根因分析
**Talking Points:**
- CUSUM 比传统阈值报警提前 5-15 分钟预警
- 传统报警：参数超过阈值才报 → 已经出问题了
- CUSUM：检测参数的累积偏移趋势 → 问题还在萌芽阶段就预警
- 根因分析：报警触发时自动分析 30 分钟前后参数趋势，匹配知识库模式
- 实际价值：凌晨不用盯屏，系统提前预警

**Transition:** "除了异常检测，AI 还能推断看不到的参数..."
**Time:** ~2 minutes

---

## Slide 10: 软测量与补料优化
**Talking Points:**
- 软测量：用 OUR/kLa/pH 等在线参数推断 OD600、残糖、产物浓度
- 减少 80% 的离线取样频率，节省人力和试剂
- Monod 动力学补料优化：根据推断的生物量实时计算最优补料速率
- 指数补料公式：F = (μ_set / Yxs) × X × V / Sf
- DO-stat 控制：DO 偏差自动调整补料速率

**Transition:** "数据采集和存储是所有分析的基础..."
**Time:** ~2 minutes

---

## Slide 11: 双数据库与实时数据流
**Talking Points:**
- 双数据库设计：InfluxDB（时序数据，1 分钟聚合）+ SQLite（业务数据，不可篡改审计）
- 实时数据流：PLC 1Hz 采集 → WebSocket <1s 推送 → 前端实时显示
- 10 个 WebSocket 频道：过程数据、状态变更、报警、AI 建议等
- 365 天原始数据保留 + 永久降采样归档
- 计算参数实时推导：OUR、kLa、μ、F₀ 等

**Transition:** "这些数据通过现代化的 Web 前端呈现..."
**Time:** ~2 minutes

---

## Slide 12: 现代化 Web 前端
**Talking Points:**
- Next.js 14 + React 18 + shadcn/ui：现代技术栈，不是老旧的 WinCC
- 14 个功能页面：Dashboard、配方管理、数据浏览器、KPI、SPC 等
- 深色 MES 工业主题：专业感强，长时间使用不疲劳
- Dashboard 可定制：拖拽排序参数卡片，显隐模块
- 配方 DAG 编辑器：可视化拖拽编辑条件分支

**Transition:** "开放的前端背后是完全开放的 API..."
**Time:** ~1.5 minutes

---

## Slide 13: 开放 API 与系统集成
**Talking Points:**
- 97+ REST API 端点：覆盖 PLC、配方、批次、报警、KPI、DoE 全部功能
- 10 个 WebSocket 实时频道
- 双鉴权：JWT（前端，24h）+ API Key（MES 系统，长期）
- 对比竞品：Eppendorf 0 个 API、Sartorius ~10 个、LUCULLUS ~20 个
- 统一响应格式 + trace_id 跨系统追踪

**Transition:** "开放的数据让实验设计优化成为可能..."
**Time:** ~2 minutes

---

## Slide 14: 实验设计与贝叶斯优化
**Talking Points:**
- 7 种 DoE 方法内置：全因子、CCD、LHS、PB、BB、DSD、分数因子
- 贝叶斯优化：高斯过程 + UCB 采集函数，自适应搜索最优条件
- 实验次数减半：传统全因子 81 次 vs BIOCore 贝叶斯 47 次
- 多保真度工作流：摇瓶 → 小罐 → 贝叶斯收敛 → 确认实验
- 还有极差分析、方差分析、田口信噪比等经典分析工具

**Transition:** "来看几个具体的应用案例..."
**Time:** ~2 minutes

---

## Slide 15: 典型应用案例
**Talking Points:**
- E.coli Fed-batch：CUSUM 检测 DO Spike → 软测量推断 OD600 → AI 建议切换补料策略
- 酵母抗 Crabtree：RQ > 1.1 时 AI 建议降低补料速率，防止溢流代谢
- CHO 悬浮培养：低剪切力控制 + 软测量推断活细胞密度 + 7-14 天长周期 CUSUM 监控
- 强调 AI 在每个场景中的具体价值

**Transition:** "与市场上的主要竞品相比..."
**Time:** ~2 minutes

---

## Slide 16: 竞品对比矩阵
**Talking Points:**
- 9 个维度全面对比：成本、并行、AI、数据格式、配方、DoE、审计、部署、扩展
- BIOCore 在 7 个维度领先，2 个持平
- 核心差异：开放 vs 封闭、本地 AI vs 无/云 AI、¥3,500 vs ¥32,000+
- Pioreactor 虽然开源，但仅适用于 <20mL 微量，非工业级

**Transition:** "最后看看成本和商业价值..."
**Time:** ~2 minutes

---

## Slide 17: 成本与商业价值
**Talking Points:**
- 硬件 BOM 仅 ¥3,100，完全透明：PLC ¥1,200 + 模块 ¥1,500 + 信号板 ¥400
- 软件社区版免费（MIT 开源）
- 8 罐并行场景：BIOCore ¥28,000 vs Eppendorf ¥360,000（36 倍差距）
- 市场规模：精准发酵 CAGR 29.5%，2034 年 $7.6B
- 4 个版本梯度：Community(免费) → Professional → AI → AI Pro

**Transition:** "总结一下..."
**Time:** ~2 minutes

---

## Slide 18: 开始使用 BIOCore
**Talking Points:**
- 回顾四大核心指标：100% 离线、ISA-88 标准、8 罐并行、1/5 成本
- CTA：社区版免费下载、技术交流、PLC 调试支持
- 5 阶段路线图：MVP → 数据分析 → AI 智能 → 高级控制 → 生态
- 留下联系方式和 GitHub 地址

**Time:** ~1 minute

---

## Total Estimated Time: ~35 minutes
