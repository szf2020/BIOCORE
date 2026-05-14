// ============================================================
// reactor-routes.ts — 反应器 (reactors) 运行时控制 REST API
// ============================================================
// Extracted from index.ts (route-handler-split, post v1.12.0).
// Behavior preserving — no functional changes; same routes, same payloads,
// same audit, same WS broadcasts.
//
// Routes (mounted under /api/v1):
//   GET    /reactors                                 — 列表
//   GET    /reactors/:id/status                      — 单反应器快照
//   GET    /reactors/:id/interlocks                  — IL 实时检测
//   GET    /reactors/:id/running-faults              — RF 元数据
//   POST   /reactors                                 — 注册 (admin)
//   POST   /reactors/:id/download-recipe             — 下载配方 (admin/engineer)
//   GET    /reactors/:id/recipe                      — 已下载配方
//   POST   /reactors/:id/start                       — 启动批次 (admin/engineer/operator/service)
//   DELETE /reactors/:id                             — 移除
//   GET    /reactors/:reactorId/phases               — phase status 列表
//   POST   /reactors/:reactorId/phases/:phaseRef/start
//   POST   /reactors/:reactorId/phases/:phaseRef/hold
//   POST   /reactors/:reactorId/phases/:phaseRef/skip
//   POST   /reactors/:reactorId/phases/:phaseRef/restart
//   POST   /reactors/:id/pause | unpause | hold | restart | stop | estop | reset
//
// Dependencies are injected via `deps`. `buildReactorConfig` is a
// dependency rather than constructed in-file so that the same factory
// is shared between this file, the inline /reactors POST, the
// /reactors/:id/download-recipe path, and runOrphanRecoveryScan in
// startup.ts (deduplication of the previously-3x inline config).
// ============================================================

import type { Router } from 'express';
import type { SQLiteService } from '@biocore/data-service';
import { checkInterlocks } from '@biocore/batch-engine';
import type { BatchControllerConfig } from '@biocore/batch-engine';
import { requireRole } from './middlewares/auth';
import {
  reactorManager,
  INTERLOCK_META,
  RUNNING_FAULT_META,
} from './reactor-wiring';

export interface ReactorRoutesDeps {
  sqlite: SQLiteService;
  parseRecipeRow: (row: any) => any;
  /** Construct the BatchControllerConfig for a given reactor id.
   *  The factory closes over MOCK_PLC / devPlcRead / DB-backed providers. */
  buildReactorConfig: (reactorId: string) => BatchControllerConfig;
  wireReactorEvents: (reactorId: string) => void;
  broadcast: (
    channel: string,
    payload: any,
    batchId?: string | null,
    reactorId?: string | null,
  ) => void;
}

export function registerReactorRoutes(
  apiRouter: Router,
  deps: ReactorRoutesDeps,
): void {
  const {
    sqlite,
    parseRecipeRow,
    buildReactorConfig,
    wireReactorEvents,
    broadcast,
  } = deps;

  // GET /api/reactors — 列出所有反应器
  /**
   * @openapi
   * /reactors:
   *   get:
   *     summary: 列出所有运行时反应器
   *     tags: [Reactors]
   *     responses:
   *       200:
   *         description: 反应器实时状态列表 (来自 ReactorManager 内存)
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/UnifiedResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id: { type: string, example: "Reactor-1" }
   *                           state: { type: string, enum: [idle, running, held, paused, stopped, complete] }
   *                           batchId: { type: string }
   */
  apiRouter.get('/reactors', (_req, res) => {
    res.json(reactorManager.listReactors());
  });

  // GET /api/reactors/:id/status — 单个反应器状态
  /**
   * @openapi
   * /reactors/{id}/status:
   *   get:
   *     summary: 获取单反应器完整状态 (含 phase 列表 + 当前 step)
   *     tags: [Reactors]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, example: "Reactor-1" }
   *     responses:
   *       200:
   *         description: 反应器状态完整快照
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/UnifiedResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: object
   *                       properties:
   *                         state: { type: string, enum: [idle, running, held, paused, stopped, complete] }
   *                         phase_index: { type: integer }
   *                         phase_id: { type: string }
   *                         total_phases: { type: integer }
   *                         step_number: { type: integer }
   *                         total_steps: { type: integer }
   *                         step_name: { type: string }
   *                         batch_elapsed_sec: { type: integer }
   *                         buttons:
   *                           type: object
   *                           description: 各操作按钮的可用性 (start/pause/stop/reset 等)
   *                         phase_statuses:
   *                           type: array
   *                           items: { type: object }
   *       404: { description: 反应器不存在 }
   */
  apiRouter.get('/reactors/:id/status', (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.id);
    if (!ctrl) return res.status(404).json({ error: `反应器 ${req.params.id} 不存在` });
    res.json({
      id: req.params.id,
      state: ctrl.currentState,
      batch_id: ctrl.currentBatchId || null,
      buttons: ctrl.buttons,
      phase_statuses: ctrl.getPhaseStatuses(),
    });
  });

  // ── RF / IL 状态机连锁与运行故障 API (关联到状态机) ──
  // IL/RF 元数据已迁至 ./reactor-wiring (INTERLOCK_META, RUNNING_FAULT_META)
  // 并在文件顶部导入。

  // GET /api/reactors/:id/interlocks — 当前反应器启动前连锁 (IL) 实时状态
  apiRouter.get('/reactors/:id/interlocks', async (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.id);
    if (!ctrl) {
      // 反应器未注册时返回纯元数据 (未执行检测)
      return res.json({
        reactor_id: req.params.id,
        all_passed: false,
        checked: false,
        items: INTERLOCK_META.map(m => ({ ...m, passed: false, detail: '反应器未注册' })),
      });
    }
    // 调用已注入的 plcRead 执行实时 interlock 检测
    try {
      const cfg = (ctrl as any).config as BatchControllerConfig;
      const result = await checkInterlocks(cfg.plcRead);
      // 合并元数据和实时结果
      const byId = new Map(result.results.map((r: any) => [r.id, r]));
      const items = INTERLOCK_META.map(m => {
        const r = byId.get(m.id);
        return {
          ...m,
          passed: r?.passed ?? false,
          detail: r?.detail ?? '未检测',
        };
      });
      res.json({
        reactor_id: req.params.id,
        all_passed: result.allPassed,
        checked: true,
        items,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/reactors/:id/running-faults — 运行故障 (RF) 列表 (纯元数据, 实时触发由 WS alarm 推送)
  apiRouter.get('/reactors/:id/running-faults', (_req, res) => {
    res.json({
      items: RUNNING_FAULT_META,
    });
  });

  // POST /api/reactors — 注册新反应器
  apiRouter.post('/reactors', requireRole('admin'), (req, res) => {
    const { reactorId } = req.body;
    if (!reactorId) return res.status(400).json({ error: '缺少 reactorId' });
    try {
      // 占位config: 实际生产中由PLC连接配置注入
      const config = buildReactorConfig(reactorId);
      reactorManager.addReactor(reactorId, config);
      wireReactorEvents(reactorId);
      res.json({ success: true, message: `反应器 ${reactorId} 已注册` });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // POST /api/reactors/:id/download-recipe — 下载配方到指定罐子
  /**
   * @openapi
   * /reactors/{id}/download-recipe:
   *   post:
   *     summary: 下载已锁定 (approved) 配方到指定反应器
   *     tags: [Reactors]
   *     description: |
   *       配方必须是 status=approved 才能下载. 下载后反应器进入"已就绪"状态可启动批次.
   *       此操作会触发 WS 广播 `recipe_downloaded` 事件给所有客户端.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, example: "Reactor-1" }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [recipe_id]
   *             properties:
   *               recipe_id: { type: string, example: "ECOLI_V1" }
   *               version: { type: string, example: "1.0.0", description: "省略时取最新" }
   *     responses:
   *       200:
   *         description: 下载成功
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/UnifiedResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: object
   *                       properties:
   *                         success: { type: boolean }
   *                         message: { type: string }
   *                         reactor_id: { type: string }
   *                         recipe_id: { type: string }
   *                         recipe_name: { type: string }
   *                         phases_count: { type: integer }
   *       404: { description: 配方不存在 }
   *       400: { description: 缺少 recipe_id }
   */
  apiRouter.post('/reactors/:id/download-recipe', requireRole('admin', 'engineer'), async (req, res) => {
    const { recipe_id, version } = req.body;
    if (!recipe_id) return res.status(400).json({ error: '缺少 recipe_id' });

    // 1. 获取配方
    const recipeRow = sqlite.getRecipe(recipe_id, version);
    if (!recipeRow) return res.status(404).json({ error: `配方 ${recipe_id} v${version || 'latest'} 不存在` });

    const recipe = parseRecipeRow(recipeRow);

    // 2. 注册反应器 (如果不存在则自动创建)
    const reactorId = req.params.id;
    if (!reactorManager.has(reactorId)) {
      const config = buildReactorConfig(reactorId);
      reactorManager.addReactor(reactorId, config);
      wireReactorEvents(reactorId);
    }

    // 3. 存储配方到反应器 (供后续启动使用)
    const ctrl = reactorManager.getReactor(reactorId)!;

    // 存储已下载的配方信息到内存 (用于启动时)
    (ctrl as any)._downloadedRecipe = recipe;
    (ctrl as any)._downloadedAt = new Date().toISOString();

    // 广播配方下载事件 (前端不再轮询)
    broadcast('recipe_downloaded', {
      reactor_id: reactorId,
      recipe_id: recipe.recipe_id,
      recipe_name: recipe.name,
      version: recipe.version,
      phases: recipe.phases || [],
      execution_mode: (recipe as any).execution_mode || 'free',
      downloaded_at: (ctrl as any)._downloadedAt,
    }, null, reactorId);

    res.json({
      success: true,
      message: `配方 ${recipe.name} v${recipe.version} 已下载到 ${reactorId}`,
      reactor_id: reactorId,
      recipe_id: recipe.recipe_id,
      recipe_name: recipe.name,
      phases_count: recipe.phases?.length || 0,
    });
  });

  // GET /api/reactors/:id/recipe — 获取罐子当前已下载的配方
  apiRouter.get('/reactors/:id/recipe', (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.id);
    if (!ctrl) return res.json({ downloaded: false });
    const recipe = (ctrl as any)._downloadedRecipe;
    if (!recipe) return res.json({ downloaded: false });
    res.json({
      downloaded: true,
      recipe_id: recipe.recipe_id,
      recipe_name: recipe.name,
      version: recipe.version,
      phases_count: recipe.phases?.length || 0,
      downloaded_at: (ctrl as any)._downloadedAt,
    });
  });

  // POST /api/reactors/:id/start — 用已下载的配方启动批次
  apiRouter.post('/reactors/:id/start', requireRole('admin', 'engineer', 'operator', 'service'), async (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.id);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });

    const recipe = (ctrl as any)._downloadedRecipe;
    if (!recipe) return res.status(400).json({ error: '未下载配方，请先下载配方到此罐' });

    // 批次号必须由前端提供 (统计报表/追溯需要), 空串或 undefined 直接拒绝
    const suppliedBatchId = (req.body?.batch_id || '').toString().trim();
    if (!suppliedBatchId) {
      return res.status(400).json({ error: '批次号必填, 请在配方主控输入批次号后再启动' });
    }
    // 允许字母/数字/下划线/短横线, 其它字符一律拒绝
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(suppliedBatchId)) {
      return res.status(400).json({ error: '批次号仅允许字母数字下划线短横线 (1-40 字符)' });
    }
    const batchId = suppliedBatchId;

    try {
      const result = await ctrl.start(recipe, batchId);
      if (result.success) {
        // 记录批次到SQLite
        try {
          sqlite.createBatch({
            batch_id: batchId, recipe_id: recipe.recipe_id, recipe_version: recipe.version,
            reactor_id: req.params.id, organism: recipe.target_organism,
            operator_id: 'admin-001', total_phases: recipe.phases?.length || 0,
          });
        } catch { /* ignore if batch table has issues */ }
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // DELETE /api/reactors/:id — 移除反应器
  apiRouter.delete('/reactors/:id', (req, res) => {
    reactorManager.removeReactor(req.params.id);
    res.json({ success: true });
  });

  // ── Phase级控制 API ──

  // GET /api/reactors/:reactorId/phases — 获取所有phase状态
  apiRouter.get('/reactors/:reactorId/phases', (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.reactorId);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
    res.json(ctrl.getPhaseStatuses());
  });

  // T24: numeric phase index path translates to nodeId via phase_index lookup
  // (deprecated; emits Deprecation + Sunset headers — external consumers should migrate to nodeId).
  function resolvePhaseRef(ctrl: ReturnType<typeof reactorManager.getReactor>, ref: string, res: any): string | null {
    if (!ctrl) return null;
    if (/^\d+$/.test(ref)) {
      res.set('Deprecation', 'true').set('Sunset', '2026-12-01');
      const idx = parseInt(ref);
      const ps = ctrl.getPhaseStatuses().find(s => s.phase_index === idx);
      if (!ps?.node_id) {
        res.status(404).json({ error: `Phase index ${idx} not found` });
        return null;
      }
      return ps.node_id;
    }
    return ref;
  }

  // POST /api/reactors/:reactorId/phases/:phaseRef/start
  // phaseRef is a DAG nodeId. Numeric index is deprecated but still accepted (translated to nodeId).
  apiRouter.post('/reactors/:reactorId/phases/:phaseRef/start', (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.reactorId);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
    const nodeId = resolvePhaseRef(ctrl, req.params.phaseRef, res);
    if (!nodeId) return; // resolvePhaseRef already sent 404
    const result = ctrl.startPhase(nodeId);
    if (!result.success) return res.status(400).json({ error: result.message });
    res.json({ success: true });
  });

  // POST /api/reactors/:reactorId/phases/:phaseRef/hold
  apiRouter.post('/reactors/:reactorId/phases/:phaseRef/hold', (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.reactorId);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
    const nodeId = resolvePhaseRef(ctrl, req.params.phaseRef, res);
    if (!nodeId) return;
    ctrl.holdPhase(nodeId, req.body.reason);
    res.json({ success: true });
  });

  // POST /api/reactors/:reactorId/phases/:phaseRef/skip
  apiRouter.post('/reactors/:reactorId/phases/:phaseRef/skip', (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.reactorId);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
    const nodeId = resolvePhaseRef(ctrl, req.params.phaseRef, res);
    if (!nodeId) return;
    ctrl.skipPhase(nodeId);
    res.json({ success: true });
  });

  // POST /api/reactors/:reactorId/phases/:phaseRef/restart
  apiRouter.post('/reactors/:reactorId/phases/:phaseRef/restart', (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.reactorId);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
    const nodeId = resolvePhaseRef(ctrl, req.params.phaseRef, res);
    if (!nodeId) return;
    ctrl.restartPhase(nodeId);
    res.json({ success: true });
  });

  // ── 批次级控制 API (暂停/恢复/放弃/急停/复位) ──

  apiRouter.post('/reactors/:id/pause', (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.id);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
    ctrl.pause();
    res.json({ success: true, state: ctrl.currentState });
  });

  apiRouter.post('/reactors/:id/unpause', (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.id);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
    ctrl.unpause();
    res.json({ success: true, state: ctrl.currentState });
  });

  apiRouter.post('/reactors/:id/hold', (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.id);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
    ctrl.hold(req.body.reason);
    res.json({ success: true, state: ctrl.currentState });
  });

  apiRouter.post('/reactors/:id/restart', requireRole('admin', 'engineer', 'operator'), (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.id);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
    ctrl.restart();
    res.json({ success: true, state: ctrl.currentState });
  });

  apiRouter.post('/reactors/:id/stop', requireRole('admin', 'engineer', 'operator', 'service'), (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.id);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
    ctrl.stop();
    res.json({ success: true, state: ctrl.currentState });
  });

  apiRouter.post('/reactors/:id/estop', requireRole('admin', 'engineer', 'operator', 'service'), (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.id);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
    ctrl.estop();
    res.json({ success: true, state: ctrl.currentState });
  });

  apiRouter.post('/reactors/:id/reset', (req, res) => {
    const ctrl = reactorManager.getReactor(req.params.id);
    if (!ctrl) return res.status(404).json({ error: '反应器不存在' });
    ctrl.reset();
    // 清除已下载配方
    (ctrl as any)._downloadedRecipe = null;
    (ctrl as any)._downloadedAt = null;
    res.json({ success: true, state: ctrl.currentState });
  });
}
