# BIOCore 会话交接文档

> **最新开发进度文档: [开发进度_Sprint3_配方v2.md](开发进度_Sprint3_配方v2.md)**
>
> 下一次会话请优先阅读上述文档。Sprint 3 已完成配方 v2(版本化/审批/模板/DAG/条件分支)+ M3.10 审计与 E2E 收尾。

## 历史交接文档
- [开发进度_Sprint3_配方v2.md](开发进度_Sprint3_配方v2.md) — **[Sprint 3, 2026-04]** 配方版本化+diff / pending_approval 审批工作流 / 模板库 / Phase 复制粘贴 / DAG schema + react-flow 图形编辑器 / IF/ELSE 条件分支 + 表达式求值 / recipe-validator BV-13~17 DAG 规则 / 后端 5 端点审计硬化 + curl E2E 脚本
- [开发进度_Sprint2_价值增强.md](开发进度_Sprint2_价值增强.md) — **[Sprint 2, 2026-04]** ECharts 迁移 / LTTB 服务端下采样 / 多反应器多批次对比 / 离线取样字段扩展 / 设备 category / 原料库 M9(MSDS PDF + 物性曲线)
- [开发进度_Sprint1_API公开化.md](开发进度_Sprint1_API公开化.md) — **[Sprint 1, 2026-04]** umzug migration / Express Router /api/v1 双挂载 / trace_id + 统一响应格式 / API Key 认证 / Swagger 文档 / WS 鉴权 / MOCK_PLC 环境变量化
- [开发进度_20260407.md](开发进度_20260407.md) — 设备配置/配方执行模式/审计追踪/Dashboard重构/Bug修复
- [开发进度_20260406.md](开发进度_20260406.md) — 缺失功能补全/JWT认证/软测量集成/WebSocket广播

## 验证脚本
- `scripts/sprint3-e2e.sh` — Sprint 3 配方工作流 10 场景端到端验证(bash + jq + curl)。用法: `BIOCORE_URL=http://localhost:3001/api/v1 ./scripts/sprint3-e2e.sh`

## MES 集成相关文档 (Sprint 1 新增)
- [API_INTEGRATION.md](API_INTEGRATION.md) — MES 等外部系统对接指南 (鉴权/响应格式/trace_id/v0 兼容期)
- [WS_PROTOCOL.md](WS_PROTOCOL.md) — WebSocket 协议规范 (channel 列表/close codes/重连策略)
- [部署说明.md](部署说明.md) — 生产部署 checklist (含 MOCK_PLC 必须禁用)
- 交互式 API 文档: `http://biocore-host:3001/api/v1/docs/`

## 快速启动

```bash
cd /c/biocore/packages/server && npx tsx src/index.ts        # API :3001
cd /c/biocore/packages/web-ui && npx next dev --port 3000     # 前端 :3000
```

默认登录: admin / admin123

## 项目路径

- 项目根: `/c/biocore` (pnpm monorepo, 9个包)
- 最新进度: `/c/biocore/docs/开发进度_20260407.md`
- 规划文档: `/c/biocore/docs/00_BIOCore_产品规划主文档.md` + 7份子文档
- SQLite数据库: `/c/biocore/packages/server/data/biocore.db`
