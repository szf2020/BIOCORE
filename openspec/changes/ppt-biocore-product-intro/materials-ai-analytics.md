# BIOCore 本地AI智能模块与数据分析 — 素材收集

> 生成于 2026-04-12 | 主题：Local AI Stack, Anomaly Detection, Soft Sensors, DoE, Data Architecture

---

## 一、本地 AI 技术栈（Local AI Stack）

### 核心定位
**100% 离线运行，零云依赖，AI 永不直接写 PLC**

这不只是技术选择，而是实验室安全哲学：
- 工艺配方、菌株性能数据等核心知识产权完全在本地
- 无网络依赖——实验室网络条件参差不齐，本地 AI 在无网络环境下仍完整运行
- 本地推理延迟 <100ms，云端 API 受网络抖动影响明显
- 无使用成本：云端 AI API 按调用量计费，本地部署一次性成本，长期经济

### Ollama + Qwen2.5-7B 部署方案

| 组件 | 说明 |
|------|------|
| **运行时** | Ollama（开源，本地模型管理与推理框架） |
| **模型** | Qwen2.5-7B（阿里云开源，中文理解能力强） |
| **部署方式** | 标准 PC，无需 GPU 服务器（CPU 推理可接受） |
| **网络要求** | 模型拉取后完全离线运行，支持气隙（air-gapped）环境 |
| **可扩展性** | 支持针对发酵领域进行 fine-tune 或 RAG 增强 |

**外部验证：** Ollama 0.8/0.9 系列（2025年）已支持工具调用流式推理，进一步增强生物过程实时问答能力。私有 LLM 推理在生物技术领域被认为是在不牺牲数据保密性的前提下利用 AI 突破的关键路径（IntuitionLabs, 2025）。

### LLM 对话功能

| 功能 | 实现 |
|------|------|
| 自然语言查询数据 | NL → Flux 查询转换（InfluxDB 查询语言） |
| 批次摘要生成 | 自动提取关键事件、异常、阶段转换 |
| 工艺问答 | 基于历史批次知识库的 RAG 检索增强 |

**后端包：** `ai-gateway`（Ollama + Qwen2.5-7B）

---

## 二、CUSUM 异常检测（Anomaly Detection）

### 技术原理

CUSUM（Cumulative Sum Control Chart，累积和控制图）是专为检测小幅过程漂移而设计的统计方法，通过累积偏差信号来放大微小变化。

**与传统阈值报警的核心差异：**

| 对比维度 | 传统阈值报警 | CUSUM 检测 |
|---------|------------|-----------|
| 检测机制 | 单点超限即报警 | 累积偏差趋势识别 |
| 响应时机 | 问题已发生后 | 提前 5-15 分钟预警 |
| 误报率 | 高（敏感于瞬时噪声） | 低（对噪声有抑制） |
| 早期漂移 | 不可见 | 可见 |

**BIOCore 中的具体应用：**
- 实时监测所有关键过程参数（温度、pH、DO、搅拌速率、补料速率）
- 检测参数漂移趋势，而非单点越限
- 报警触发后联动根因分析模块（30分钟前后参数趋势自动回溯）

**后端包：** `ai-analytics`（纯算法实现，无外部依赖）

### 科学依据与行业趋势

- CUSUM 在制药制造过程监控中被广泛使用，尤其适合 pH、温度、浓度等连续参数的小漂移检测（SixSigma.us, 2025）
- 2025 年研究趋势：多变量 CUSUM（Multivariate CUSUM）与机器学习结合，应用于生物反应器批次监控的持续过程验证（CPV）（PDA Journal, 2025）
- FDA 持续过程验证（CPV 4.0）框架下，AI 驱动的异常检测正在成为生物过程行业标准（Frontiers in Bioengineering, 2024）

**关键引用数据：** CUSUM 比传统阈值报警**提前 5-15 分钟**预警——对于批次发酵而言，这一时间窗口足以采取干预措施，避免批次失败，每次失败损失通常为数千至数万元试剂和人工成本。

---

## 三、DTW 批次相似性匹配

### 技术原理

DTW（Dynamic Time Warping，动态时间规整）是一种弹性距离度量算法，可比较不同时间长度的时间序列，在大多数情况下优于欧氏距离（Euclidean distance）。

**核心优势：** 发酵批次很少完全等长（诱导时间、补料策略不同导致批次时长差异），DTW 可跨越时间轴弹性对齐，找到真正"形状相似"的历史批次。

### BIOCore 中的应用

**批次相似度匹配工作流：**
```
当前运行批次 → 提取多参数时序特征
    → DTW 距离计算（与历史批次数据库比对）
    → 排序输出 Top-K 相似历史批次
    → 展示相似批次的结局（产量、质量、问题）
    → 辅助工程师判断当前批次走向
```

**诊断价值：**
- 当前批次 DO 趋势异常 → 找到历史最相似批次 → 该批次在此阶段发生了溢流代谢 → 操作员提前干预
- 一键批次叠加对比图（UI 层：数据浏览器页面）

**科学依据：**
- DTW 结合 k-NN 用于批次监控：通过计算在线批次与正常操作条件（NOC）历史批次数据库间的 DTW 距离，实现故障早期检测（ScienceDirect, 2018）
- 核 DTW（Kernel DTW）已被证明可有效解决不等长轨迹的批次同步问题（ACM, 2021）
- 在青霉素发酵过程中验证了 DTW 软测量方法的有效性（IEEE, 2010）

**后端包：** `ai-analytics`

---

## 四、软测量推断（Soft Sensors）

### 技术原理

软测量（Soft Sensor）利用易测量的过程变量（温度、DO、pH、搅拌速率、气流量）通过数学模型推断难以实时在线测量的关键变量。

### BIOCore 软测量矩阵

| 推断目标 | 算法（v1） | 算法（v2 规划） | 所需输入 |
|---------|-----------|--------------|---------|
| OD600（生物量密度） | OLS 线性回归 | ONNX 神经网络 | DO消耗速率、碱消耗速率、OUR |
| 残糖浓度（葡萄糖） | OLS 线性回归 | ONNX 神经网络 | RQ、OUR、补料累积量 |
| 产物浓度 | OLS 线性回归 | ONNX 神经网络 | OUR 积分、时间 |
| 生长阶段（代谢状态） | 碱消耗速率分析 | — | 碱消耗速率、DO、RQ |

**计算参数（实时推导，作为软测量输入）：**

| 参数 | 符号 | 单位 | 计算方式 |
|------|------|------|---------|
| 耗氧速率 | OUR | mmol/L/h | 反映代谢活性 |
| 传质系数 | kLa | 1/h | Van't Riet 关联式 |
| 比生长速率 | μ | 1/h | OUR 对数微分 |
| 呼吸商 | RQ | — | CER/OUR，代谢状态指标 |
| 灭菌当量 | F₀ | min | SIP 效果验证 |

### 实验室价值主张

**传统方式：** 每 2-4 小时手动取样 → 离线分析 OD600（分光光度计）、葡萄糖（生化分析仪）→ 手工记录 → 与过程数据人工关联。

**BIOCore 方式：** 软测量每分钟更新推断值 → 直接叠加在趋势图上 → 触发补料优化建议 → 减少 80% 取样频率。

**科学依据：**
- Roche Diagnostics 科学家开发了基于尾气分析的软测量传感器，可同时实时监测 CHO 细胞的生物量和丙酮酸代谢——证明软测量在细胞培养中的可行性（GEN News, 2025）
- XGBoost 模型结合电化学数据在葡萄糖浓度预测中达到测试集 R² = 0.928（PMC, 2025）
- 软测量结合数字孪生为需要精密控制的应用（细胞培养、微生物发酵）提供了实质性优势（MDPI, 2025）

**后端包：** `soft-sensor`（OLS 回归 + Monod 动力学）

---

## 五、补料速率优化（Feed Rate Advisor）

### 技术原理

**Monod 动力学 + 指数补料策略：**

```
μ_set = 目标比生长速率（操作员设定或 AI 推荐）
S = 底物浓度（软测量推断）
X = 生物量（软测量推断）
V = 液体体积（初始 + 累积补料计算）

F(t) = (μ_set × X × V) / (Y_xs × C_f)

其中：
Y_xs = 底物转化率
C_f = 补料液底物浓度
```

**指数补料模式（E. coli Fed-batch 典型）：**
- Batch 阶段：DO-stat 监测底物消耗（DO Spike = 底物耗尽信号）
- 切换到 Fed-batch：以指数速率 F(t) = F₀ × e^(μ_set × t) 补料
- 实时根据软测量估计的生物量动态调整

### AI 安全机制 — 建议缓冲区（Suggestion Buffer）

这是 BIOCore AI 模块最重要的设计原则：

```
AI 推理引擎
    ↓
生成建议（参数值 + 置信度 % + 推理理由）
    ↓
写入建议缓冲区（状态：pending 待审核）
    ↓
前端弹出建议卡片（操作员可见）
    ↓
操作员：[接受] 或 [拒绝]
    ↓（仅接受后）
写入 PLC 设定值（实际执行）
```

**AI 永远不会自动执行任何操作。这不是功能限制，而是实验室安全的核心设计原则。**

---

## 六、事件检测与根因分析

### 自动事件识别

| 事件类型 | 检测方法 | 典型特征 |
|---------|---------|---------|
| DO Spike（底物耗尽信号） | DO 统计特征识别 | DO 快速上升超过基线 |
| 滞后期结束 | OUR 变化率检测 | OUR 开始指数增长 |
| 溢流代谢（Crabtree效应） | RQ 阈值 + 碱消耗振荡 | RQ > 1.1，碱消耗速率振荡 |
| 稳定期进入 | μ 趋近零 + OUR 平台 | 比生长速率 <0.01 h⁻¹ |
| 溶氧控制失调 | DO <5% 持续 5 min | 触发 RF-07 故障保护 |

### 根因分析流程

```
报警触发
    ↓
自动回溯 30 分钟前过程数据
    ↓
知识库模式匹配（预定义发酵异常场景库）
    ↓
生成候选根因列表（按概率排序）
    ↓
LLM 自然语言解释（"此前碱消耗速率异常升高，可能指示溢流代谢"）
    ↓
展示给操作员（建议缓冲区）
```

**代谢状态推断（碱消耗速率分析）：**

| 碱消耗模式 | 推断代谢状态 |
|-----------|------------|
| 稳定增长 | 正常指数生长 |
| 振荡 | 溢流代谢（葡萄糖过量） |
| 快速下降 | 底物耗竭 |
| 接近零 | 滞后期或稳定期 |
| 突然升高 | pH 偏移或污染 |

---

## 七、实验设计与优化（DoE + Bayesian Optimization）

### 7 种实验设计方法

| 方法 | 适用场景 | 优势 |
|------|---------|------|
| 全因子设计（Full Factorial） | 因素 ≤4，全面交互分析 | 2^k 或 3^k 完全覆盖 |
| 中心复合设计（CCD） | 响应曲面建模 | 轴向点 + 中心点 |
| Latin 超立方采样（LHS） | 因素 >4，空间填充 | 均匀分布 |
| Plackett-Burman | 快速筛选关键因素 | N 次实验筛 N-1 因素 |
| Box-Behnken | 3 水平响应曲面 | 比 CCD 更少实验次数 |
| 确定性筛选设计（DSD） | 主效应 + 二次效应 | 2k+1 次实验 |
| 分数因子设计 | 大因素数简化 | 混淆主效应可控 |

### 贝叶斯优化（Bayesian Optimization）

**核心算法：** 高斯过程（Gaussian Process）+ UCB 采集函数（Upper Confidence Bound）

**多保真度优化工作流：**
```
Phase I：摇瓶级别快速实验（低成本，多参数组合筛选）
    ↓
Phase II：小型发酵罐验证（3-5 个候选条件）
    ↓
Phase III：贝叶斯优化收敛（高斯过程建模 + UCB 采集）
    ↓
Phase IV：最优条件确认实验（2-3 次）
```

**与传统 DoE 对比（基于 2025 年发表研究）：**
- 贝叶斯优化将所需实验次数从中心复合设计的约 25 次压缩至约 10 次（Biotechnology and Bioengineering, 2025）
- 批量贝叶斯优化在生物过程优化中优于传统 DoE，产物效价相比经典方法有所提升（Wiley, 2025）
- 高斯过程是首选代理模型，原因：数据效率高、灵活性强、内置不确定性量化（PMC, 2025）

**BIOCore 典型案例（DoE 工艺优化）：**
- Phase I：黄金分割法单因素搜索（22 次实验）
- Phase II：L9(3⁴) 正交试验 + 极差/方差分析
- Phase III：贝叶斯优化收敛最优条件（5 次确认实验）
- 总计约 47 次实验，14 周完成系统工艺优化
- 相比纯粹一次一因素（OFAT）方法，实验次数减半

**分析工具完整列表：**
- 极差分析（正交实验排名）
- 方差分析（ANOVA 显著性检验）
- 响应曲面拟合（线性/交互/二次）
- 田口信噪比（望大/望小/望目）
- 贝叶斯优化（高斯过程 + UCB 采集函数）
- 多保真度优化（摇瓶 → 发酵罐渐进验证）

**后端包：** `experiment-optimizer`

---

## 八、数据架构（Data Architecture）

### 双数据库设计

| 数据库 | 类型 | 存储内容 | 特点 |
|--------|------|---------|------|
| **InfluxDB** | 时序数据库 | 温度、pH、DO、搅拌速率、气流量等过程参数 | 1 分钟聚合写入；365 天原始数据 + 永久降采样归档 |
| **SQLite** | 关系型数据库 | 配方、批次记录、审计日志、报警历史、取样记录 | WAL 模式高并发；不可篡改（数据库触发器禁止 UPDATE/DELETE） |

### 数据流架构

```
PLC（1Hz 采集）
    ↓
WebSocket 实时推送 → 前端 Dashboard（<1秒延迟）
    ↓
60秒聚合 → 实时计算参数（OUR/kLa/μ/RQ/F₀）
    ↓
InfluxDB 持久化 ←→ ai-analytics 异常检测
    ↓
SQLite 事件记录 ←→ soft-sensor 软测量更新
```

### 离线取样数据集成

**解决的核心痛点：** 传统方式下，OD600/葡萄糖/产物浓度等离线取样数据存在纸质记录本，与在线过程数据无法自动关联。

**BIOCore 解决方案：**
- 在线录入（Web UI）+ CSV 批量导入
- 自动与时间戳关联到对应批次的过程数据
- 软测量推断值与实测值自动对比（校准软测量模型精度）
- 取样记录可通过 REST API 供外部 LIMS 系统拉取

---

## 九、KPI 仪表盘与 SPC 控制图

### OEE 仪表盘

| 指标 | 说明 |
|------|------|
| 整体设备效率（OEE） | 可用率 × 性能率 × 质量率 |
| 产率趋势 | 跨批次产物浓度/时间序列 |
| Pareto 损失分析 | 按原因分类的批次失败/异常损失 |

### SPC 控制图

| 图表类型 | 用途 |
|---------|------|
| X-bar/R 图 | 均值与极差控制 |
| EWMA 图（指数加权移动平均） | 小漂移检测，补充 CUSUM |
| 过程能力分析 Cp/Cpk | 过程稳定性评估 |
| Western Electric 判断规则 | 8 条规则自动标记异常点 |

---

## 十、行业趋势与外部佐证

### 本地/私有 AI 部署的行业驱动力

1. **监管合规压力：**
   - FDA 于 2025 年 1 月发布首个 AI 药物开发草案指南
   - FDA-EMA 联合于 2026 年 1 月发布 AI 全生命周期指导原则
   - EU AI Act 生效，医疗健康 AI 为"高风险"，合规义务 2027 年分阶段落地
   - 数据主权敏感度上升：高校课题组和生物技术初创不愿将核心工艺数据上传第三方

2. **技术成熟度提升：**
   - 本地 LLM 运行框架（Ollama 等）在 2025 年显著成熟，支持工具调用、流式推理
   - 7B 参数级别模型在消费级 GPU 或高端 CPU 上可流畅运行
   - ONNX 推理框架使轻量级机器学习模型可在任意硬件部署

3. **生物过程 AI 化成为主流预期：**
   - 集成先进控制系统的生物反应器可将整体生产率提升 15-20%，批次失败率显著降低
   - 未来 3-5 年：AI 代理和 LLM 工具将承担常规决策和故障排查，人类保留战略规划权（MDPI, 2025）
   - 贝叶斯优化正在快速取代或补充传统 DoE 成为生物过程优化的新标准

### 竞品 AI 能力对比

| | Eppendorf BioFlo | Sartorius BioPAT | BIOCore |
|--|--|--|--|
| AI 功能 | 无 | 云端（需网络） | **本地离线（零云依赖）** |
| 异常检测 | 仅阈值报警 | 部分分析 | **CUSUM 5-15 分钟提前预警** |
| 软测量 | 无 | 需专有传感器 | **OLS 回归 + 规划 ONNX** |
| 实验优化 | 无 | 无 | **7 种 DoE + 贝叶斯优化** |
| LLM 对话 | 无 | 无 | **Qwen2.5-7B 本地对话** |

---

## 十一、关键数字记忆点（PPT 用）

| 数字 | 含义 |
|------|------|
| **5-15 分钟** | CUSUM 比传统报警提前预警的时间窗口 |
| **100% 离线** | AI 模块完全本地运行，零网络依赖 |
| **7 种 DoE** | 覆盖从快速筛选到响应曲面的全谱实验设计方法 |
| **~50%** | 贝叶斯优化相比 OFAT 方法减少的实验次数 |
| **<100ms** | 本地 AI 推理延迟（云端 API 无法保证） |
| **0** | AI 直接控制 PLC 的次数（建议缓冲区机制保证） |
| **1/min** | 软测量推断更新频率（vs 传统 2-4h 手动取样） |

---

## 参考来源

- [Private LLM Inference for Biotech — IntuitionLabs](https://intuitionlabs.ai/articles/private-llm-inference-biotech)
- [Ollama Local LLM Privacy-First AI 2025 — Cohorte](https://www.cohorte.co/blog/run-llms-locally-with-ollama-privacy-first-ai-for-developers-in-2025)
- [CUSUM Charts Detecting Process Shifts — SixSigma.us](https://www.6sigma.us/six-sigma-in-focus/cusum-charts-detecting-process-shifts/)
- [CPV of the Future: AI-Powered Continued Process Verification — PDA Journal](https://journal.pda.org/content/77/3/146)
- [Monitoring batch processes with DTW and k-NN — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0169743918302004)
- [Soft sensor based on kernel DTW for unequal-length batch processes — ACM/ScienceDirect](https://dl.acm.org/doi/10.1016/j.eswa.2021.115223)
- [Soft Sensors, Biopharma 4.0, and Advanced Therapies — GEN](https://www.genengnews.com/topics/bioprocessing/soft-sensors-biopharma-4-0-and-advanced-therapies/)
- [A Guide to Bayesian Optimization in Bioprocess Engineering — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13003447/)
- [Bayesian Optimization in Bioprocess Engineering — Biotechnology and Bioengineering 2025](https://analyticalsciencejournals.onlinelibrary.wiley.com/doi/10.1002/bit.28960)
- [AI Review: Biorefineries and Bioprocessing — MDPI Processes](https://www.mdpi.com/2227-9717/13/8/2544)
- [Smart Fermentation Technologies — MDPI Fermentation 2025](https://www.mdpi.com/2311-5637/11/6/323)
- [Perspectives for AI in Bioprocess Automation — ScienceDirect 2025](https://www.sciencedirect.com/science/article/pii/S0958166925001363)
- [Contamination Detection in Fermentation via ML — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12367959/)
