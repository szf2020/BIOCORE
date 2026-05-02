// ============================================================
// kpi-routes.ts — 批次 KPI 计算与查询
//
// 参考 DELMIA Apriso MPI (Manufacturing Process Intelligence):
//   OEE = 可用率 × 性能率 × 合格率
//   + 批次级: 周期时间、产量、滴度、吞吐量、停机时间
// ============================================================

import type { Router } from 'express';
import type { SQLiteService } from '@biocore/data-service';

// ─── KPI 计算纯函数 ──────────────────────────────────────

interface KpiInput {
  batchId: string;
  reactorId: string;
  recipeId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  outcome: string | null;
  // 从关联表查询的数据
  holdDurations: number[];   // 每次 held 的秒数
  alarmCount: number;
  lastTiter: number | null;  // 最后一个 offline_sample 的 product_titer
  lastWeight: number | null; // 最后一个 offline_sample 时的液体体积 (kg ≈ L)
}

interface KpiResult {
  availability_pct: number | null;
  performance_pct: number | null;
  quality_pct: number | null;
  oee_pct: number | null;
  cycle_time_h: number | null;
  yield_g: number | null;
  titer_g_L: number | null;
  throughput_g_h: number | null;
  downtime_min: number;
  alarm_count: number;
  hold_count: number;
}

/**
 * 计算单批次 KPI (纯函数, 无副作用)
 */
export function calculateBatchKpi(input: KpiInput): KpiResult {
  const { startedAt, endedAt, outcome, holdDurations, alarmCount, lastTiter, lastWeight } = input;

  // 周期时间
  let cycleTimeH: number | null = null;
  if (startedAt && endedAt) {
    const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    cycleTimeH = ms > 0 ? ms / 3600000 : null;
  }

  // 停机时间 (held 状态累计)
  const downtimeMin = holdDurations.reduce((s, d) => s + d, 0) / 60;
  const holdCount = holdDurations.length;

  // 可用率
  let availabilityPct: number | null = null;
  if (cycleTimeH && cycleTimeH > 0) {
    const totalMin = cycleTimeH * 60;
    availabilityPct = Math.max(0, Math.min(1, (totalMin - downtimeMin) / totalMin));
  }

  // 性能率 (暂无理想周期基准, 默认1.0)
  const performancePct = 1.0;

  // 合格率
  const qualityPct = outcome === 'success' ? 1.0 : outcome === 'partial' ? 0.5 : 0;

  // OEE
  let oeePct: number | null = null;
  if (availabilityPct !== null) {
    oeePct = availabilityPct * performancePct * qualityPct;
  }

  // 产量
  let yieldG: number | null = null;
  let throughputGH: number | null = null;
  const titerGL = lastTiter ?? null;
  if (titerGL !== null && lastWeight !== null && lastWeight > 0) {
    yieldG = titerGL * lastWeight; // g/L × L ≈ g
  }
  if (yieldG !== null && cycleTimeH !== null && cycleTimeH > 0) {
    throughputGH = yieldG / cycleTimeH;
  }

  return {
    availability_pct: availabilityPct !== null ? round(availabilityPct, 4) : null,
    performance_pct: round(performancePct, 4),
    quality_pct: round(qualityPct, 4),
    oee_pct: oeePct !== null ? round(oeePct, 4) : null,
    cycle_time_h: cycleTimeH !== null ? round(cycleTimeH, 2) : null,
    yield_g: yieldG !== null ? round(yieldG, 2) : null,
    titer_g_L: titerGL !== null ? round(titerGL, 3) : null,
    throughput_g_h: throughputGH !== null ? round(throughputGH, 3) : null,
    downtime_min: round(downtimeMin, 1),
    alarm_count: alarmCount,
    hold_count: holdCount,
  };
}

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

// ─── 路由注册 ──────────────────────────────────────────────

export function registerKpiRoutes(
  router: Router,
  sqlite: SQLiteService,
): void {
  const db = () => (sqlite as any).db || sqlite.getDatabase();

  // ─── 计算并存储单批次 KPI ────────────────────────────

  /**
   * POST /kpis/batches/:id/calculate
   * 手动或自动触发 KPI 计算
   */
  router.post('/kpis/batches/:id/calculate', (req, res) => {
    try {
      const batchId = req.params.id;
      const kpi = computeAndStore(db(), batchId);
      if (!kpi) return res.status(404).json({ error: '批次不存在' });
      res.json(kpi);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /kpis/batches — 批次 KPI 列表 */
  router.get('/kpis/batches', (req, res) => {
    try {
      const { reactor_id, limit = '50', offset = '0' } = req.query;
      let sql = 'SELECT * FROM batch_kpis';
      const params: any[] = [];
      if (reactor_id) { sql += ' WHERE reactor_id = ?'; params.push(reactor_id); }
      sql += ' ORDER BY calculated_at DESC LIMIT ? OFFSET ?';
      params.push(Number(limit), Number(offset));
      const rows = db().prepare(sql).all(...params);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /kpis/batches/:id — 单批次 KPI */
  router.get('/kpis/batches/:id', (req, res) => {
    try {
      const row = db().prepare('SELECT * FROM batch_kpis WHERE batch_id = ?').get(req.params.id);
      if (!row) return res.status(404).json({ error: 'KPI 未计算' });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /kpis/summary — 聚合 KPI */
  router.get('/kpis/summary', (req, res) => {
    try {
      const { reactor_id, days = '30' } = req.query;
      const since = new Date(Date.now() - Number(days) * 86400000).toISOString();
      let sql = `SELECT
        COUNT(*) as batch_count,
        AVG(oee_pct) as avg_oee,
        AVG(cycle_time_h) as avg_cycle_time_h,
        AVG(yield_g) as avg_yield_g,
        AVG(titer_g_L) as avg_titer,
        AVG(throughput_g_h) as avg_throughput,
        AVG(downtime_min) as avg_downtime_min,
        SUM(alarm_count) as total_alarms,
        SUM(hold_count) as total_holds
      FROM batch_kpis WHERE calculated_at >= ?`;
      const params: any[] = [since];
      if (reactor_id) { sql += ' AND reactor_id = ?'; params.push(reactor_id); }
      const row = db().prepare(sql).get(...params);
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /kpis/trends — KPI 趋势 (最近 N 批次) */
  router.get('/kpis/trends', (req, res) => {
    try {
      const { reactor_id, limit = '20' } = req.query;
      let sql = 'SELECT batch_id, reactor_id, oee_pct, cycle_time_h, yield_g, titer_g_L, throughput_g_h, downtime_min, calculated_at FROM batch_kpis';
      const params: any[] = [];
      if (reactor_id) { sql += ' WHERE reactor_id = ?'; params.push(reactor_id); }
      sql += ' ORDER BY calculated_at DESC LIMIT ?';
      params.push(Number(limit));
      const rows = db().prepare(sql).all(...params);
      res.json(rows.reverse()); // 时间正序返回
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 损失事件 API (参考 OEE-Designer 8类损失模型) ──────

  const LOSS_LABELS: Record<string, string> = {
    planned_downtime: '计划停机',
    unplanned_downtime: '非计划停机',
    setup_changeover: '换型/配方切换',
    minor_stoppage: '微停',
    reduced_speed: '降速运行',
    quality_loss: '质量损失',
    no_demand: '无需求',
    other: '其他',
  };

  /** GET /kpis/batches/:id/losses — 单批次损失分解 */
  router.get('/kpis/batches/:id/losses', (req, res) => {
    try {
      const rows = db().prepare(
        'SELECT * FROM batch_loss_events WHERE batch_id = ? ORDER BY created_at'
      ).all(req.params.id);
      // 按类别汇总
      const byCategory: Record<string, number> = {};
      for (const r of (rows as any[])) {
        byCategory[r.category] = (byCategory[r.category] || 0) + r.duration_min;
      }
      res.json({
        events: rows,
        summary: Object.entries(byCategory).map(([category, total_min]) => ({
          category, label: LOSS_LABELS[category] || category, total_min: round(total_min as number, 1),
        })).sort((a, b) => b.total_min - a.total_min),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** POST /kpis/batches/:id/losses — 手动记录损失事件 */
  router.post('/kpis/batches/:id/losses', (req, res) => {
    try {
      const { category, reason, duration_min, started_at, ended_at, recorded_by } = req.body;
      if (!category || !reason || !duration_min) {
        return res.status(400).json({ error: '缺少 category, reason, duration_min' });
      }
      db().prepare(`
        INSERT INTO batch_loss_events (batch_id, category, reason, duration_min, started_at, ended_at, recorded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(req.params.id, category, reason, duration_min, started_at || null, ended_at || null, recorded_by || 'system');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /kpis/pareto — 帕累托分析 (跨批次按损失类别汇总) */
  router.get('/kpis/pareto', (req, res) => {
    try {
      const { days = '30', reactor_id } = req.query;
      const since = new Date(Date.now() - Number(days) * 86400000).toISOString();
      let sql = `SELECT category, SUM(duration_min) as total_min, COUNT(*) as event_count
        FROM batch_loss_events WHERE created_at >= ?`;
      const params: any[] = [since];
      if (reactor_id) {
        sql += ` AND batch_id IN (SELECT batch_id FROM batches WHERE reactor_id = ?)`;
        params.push(reactor_id);
      }
      sql += ' GROUP BY category ORDER BY total_min DESC';
      const rows: any[] = db().prepare(sql).all(...params);

      // 计算累计百分比
      const grandTotal = rows.reduce((s, r) => s + r.total_min, 0);
      let cumulative = 0;
      const pareto = rows.map(r => {
        cumulative += r.total_min;
        return {
          category: r.category,
          label: LOSS_LABELS[r.category] || r.category,
          total_min: round(r.total_min, 1),
          event_count: r.event_count,
          percentage: grandTotal > 0 ? round(r.total_min / grandTotal * 100, 1) : 0,
          cumulative_pct: grandTotal > 0 ? round(cumulative / grandTotal * 100, 1) : 0,
        };
      });
      res.json({ grand_total_min: round(grandTotal, 1), pareto });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /kpis/loss-categories — 损失类别定义 */
  router.get('/kpis/loss-categories', (_req, res) => {
    res.json(Object.entries(LOSS_LABELS).map(([key, label]) => ({ key, label })));
  });
}

// ─── KPI 计算核心 (从数据库查询并存储) ────────────────────

export function computeAndStore(db: any, batchId: string): any | null {
  // 1. 读取批次基础信息
  const batch: any = db.prepare(
    'SELECT batch_id, reactor_id, recipe_id, started_at, ended_at, outcome FROM batches WHERE batch_id = ?'
  ).get(batchId);
  if (!batch) return null;

  // 2. 计算 held 停机时长 (从 state_transitions)
  const holdTransitions: any[] = db.prepare(
    `SELECT from_state, to_state, timestamp FROM state_transitions
     WHERE batch_id = ? AND (from_state = 'held' OR to_state = 'held')
     ORDER BY timestamp`
  ).all(batchId);

  const holdDurations: number[] = [];
  let holdStart: number | null = null;
  for (const t of holdTransitions) {
    if (t.to_state === 'held') {
      holdStart = new Date(t.timestamp).getTime();
    } else if (t.from_state === 'held' && holdStart) {
      holdDurations.push((new Date(t.timestamp).getTime() - holdStart) / 1000);
      holdStart = null;
    }
  }

  // 3. 报警计数
  const alarmRow: any = db.prepare(
    'SELECT COUNT(*) as cnt FROM alarms WHERE batch_id = ?'
  ).get(batchId);

  // 4. 最后一个离线样品
  const lastSample: any = db.prepare(
    'SELECT product_titer, OD600 FROM offline_samples WHERE batch_id = ? ORDER BY sample_time DESC LIMIT 1'
  ).get(batchId);

  // 5. 液体体积 (从最后的重量估算, 或使用 5L 默认值)
  const lastWeight = 5.0; // 5L 发酵罐默认工作体积

  // 6. 计算 KPI
  const kpi = calculateBatchKpi({
    batchId,
    reactorId: batch.reactor_id || '',
    recipeId: batch.recipe_id,
    startedAt: batch.started_at,
    endedAt: batch.ended_at,
    outcome: batch.outcome,
    holdDurations,
    alarmCount: alarmRow?.cnt ?? 0,
    lastTiter: lastSample?.product_titer ?? null,
    lastWeight,
  });

  // 7. 写入 (upsert)
  db.prepare(`
    INSERT INTO batch_kpis (batch_id, reactor_id, recipe_id,
      availability_pct, performance_pct, quality_pct, oee_pct,
      cycle_time_h, yield_g, titer_g_L, throughput_g_h,
      downtime_min, alarm_count, hold_count, calculated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(batch_id) DO UPDATE SET
      availability_pct=excluded.availability_pct,
      performance_pct=excluded.performance_pct,
      quality_pct=excluded.quality_pct,
      oee_pct=excluded.oee_pct,
      cycle_time_h=excluded.cycle_time_h,
      yield_g=excluded.yield_g,
      titer_g_L=excluded.titer_g_L,
      throughput_g_h=excluded.throughput_g_h,
      downtime_min=excluded.downtime_min,
      alarm_count=excluded.alarm_count,
      hold_count=excluded.hold_count,
      calculated_at=datetime('now')
  `).run(
    batchId, batch.reactor_id || '', batch.recipe_id,
    kpi.availability_pct, kpi.performance_pct, kpi.quality_pct, kpi.oee_pct,
    kpi.cycle_time_h, kpi.yield_g, kpi.titer_g_L, kpi.throughput_g_h,
    kpi.downtime_min, kpi.alarm_count, kpi.hold_count,
  );

  // 8. 自动归类损失事件 (参考 OEE-Designer)
  // 将 held 状态自动归类为 unplanned_downtime
  try {
    const existingLoss = db.prepare('SELECT COUNT(*) as cnt FROM batch_loss_events WHERE batch_id = ?').get(batchId);
    if ((existingLoss as any)?.cnt === 0 && holdDurations.length > 0) {
      const insertLoss = db.prepare(
        'INSERT INTO batch_loss_events (batch_id, category, reason, duration_min, recorded_by) VALUES (?, ?, ?, ?, ?)'
      );
      // Hold 事件 → 非计划停机
      for (const dur of holdDurations) {
        insertLoss.run(batchId, 'unplanned_downtime', 'Hold 状态 (自动归类)', round(dur / 60, 1), 'system');
      }
    }
  } catch { /* 表可能不存在，忽略 */ }

  return { batch_id: batchId, ...kpi };
}
