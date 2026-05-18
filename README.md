# BIOCore — 实验室R&D发酵控制平台

[![CI](https://github.com/biocore-org/biocore/actions/workflows/ci.yml/badge.svg)](https://github.com/biocore-org/biocore/actions/workflows/ci.yml)

> 以竞品1/5的成本,提供覆盖发酵全生命周期的智能控制与数据分析平台

## 架构概览

```
Browser (React/Next.js)
    ↕ HTTP/WebSocket
Node.js (Express + XState v5)
    ├── plc-driver      S7-200 SMART G2 通讯 + 变量映射
    ├── batch-engine     ISA-88 六状态机 + 14种Phase + Step引擎
    ├── data-service     InfluxDB(时序) + SQLite(业务) 双库
    ├── ai-gateway       Ollama本地LLM + NL→Flux + 批次摘要
    ├── ai-analytics     CUSUM异常检测 + DTW批次匹配 (纯JS)
    └── soft-sensor      ONNX软测量推断 (v2.0)
    ↕ S7协议 (TCP/102)
S7-200 SMART G2 PLC
    └── 8路PID + 安全连锁 + 8AI/4AO/14DI/10DQ
```

## 快速开始

### 1. 环境要求

- Node.js ≥ 20 LTS
- pnpm ≥ 8
- Docker (用于InfluxDB)
- Ollama (可选, 用于本地AI)

### 2. 安装

```bash
# 克隆项目
git clone https://github.com/your-org/biocore.git
cd biocore

# 安装依赖
pnpm install

# 复制环境变量
cp .env.example .env

# 启动 InfluxDB
docker-compose up -d

# 初始化数据库
pnpm run db:init

# (可选) 安装本地AI
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b
```

### 3. 开发运行

```bash
# 同时启动后端和前端
pnpm run dev

# 或分别启动
pnpm run dev:server   # http://localhost:3001
pnpm run dev:ui       # http://localhost:3000
```

### 4. PLC配置

1. 访问 http://localhost:3000/settings/plc-config
2. 添加PLC连接 (IP: 192.168.2.1, Port: 102)
3. 点击"加载默认模板"初始化V区变量映射
4. 或通过CSV/JSON导入自定义变量表

## 项目结构

```
biocore/
├── config/                     # 默认配置
│   └── default-plc-variables.ts  # V区地址映射模板
├── docs/                       # 架构文档
│   └── ARCHITECTURE.md           # 完整架构拆解
├── packages/
│   ├── plc-driver/             # PLC通讯 (nodes7 + 变量映射管理)
│   ├── batch-engine/           # ISA-88状态机 (XState v5)
│   ├── data-service/           # 双数据库 + 数据采集调度
│   ├── ai-gateway/             # 本地LLM (Ollama) + NL→Flux
│   ├── ai-analytics/           # CUSUM + DTW + kLa (纯JS)
│   ├── soft-sensor/            # ONNX推断 (v2.0)
│   └── web-ui/                 # React前端 (Next.js)
│       └── src/
│           ├── app/
│           │   ├── dashboard/    # 监控面板
│           │   └── settings/
│           │       └── plc-config/  # ★PLC通讯配置页面
│           ├── components/
│           │   ├── dashboard/    # 控制面板/参数卡片/趋势图
│           │   └── layout/       # AppLayout/TopBar/SideNav
│           ├── stores/           # Zustand + WebSocket
│           └── types/            # 全局TypeScript类型
├── docker-compose.yml          # InfluxDB容器
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## 技术栈

| 层级 | 选型 |
|------|------|
| 后端运行时 | Node.js v20 LTS |
| API框架 | Express.js + ws (WebSocket) |
| PLC通讯 | nodes7 (S7协议) |
| 状态机 | XState v5 |
| 时序数据库 | InfluxDB OSS 2.x |
| 业务数据库 | SQLite (better-sqlite3, WAL模式) |
| 前端框架 | React + Next.js 14 |
| UI组件库 | shadcn/ui + Tailwind CSS |
| 趋势图 | Plotly.js |
| 状态管理 | Zustand |
| 本地LLM | Ollama + Qwen2.5-7B |
| ML推断 | onnxruntime-node |
| 包管理 | pnpm workspace |

## 开发路线图

| 阶段 | 周期 | 核心交付 |
|------|------|----------|
| Phase 1 MVP | 1-3月 | PLC通讯 + 基础PID监控 + Dashboard + ★PLC配置页面 |
| Phase 2 批次 | 4-6月 | ISA-88状态机 + 配方编辑器 + SIP/CIP + 审计追踪 |
| Phase 3 AI | 7-9月 | 本地LLM + NL→Flux + CUSUM + DTW + 批次报告 |
| Phase 4 智能 | 10-14月 | 软测量训练/推断 + 补料建议 + 多罐并行 + REST API |

## 许可证

社区版: MIT License
