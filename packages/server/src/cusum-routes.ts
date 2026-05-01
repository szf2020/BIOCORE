// ============================================================
// cusum-routes.ts — CUSUM 实时异常检测配置与控制路由
// GET /cusum/config, PUT /cusum/config, POST /cusum/:batchId/reset,
// GET /cusum/:batchId/status
// ============================================================

import type { Router } from 'express';
// CUSUMDetector 类型通过 Map 泛型参数隐式使用
// 实际类从 index.ts 传入, 这里只需要 duck-typing 接口
interface CUSUMDetectorLike {
  setBaseline(mean: number, std: number, h?: number, k?: number): void;
  detect(value: number): { anomaly: boolean; cumPos: number; cumNeg: number; normalized: number };
  reset(): void;
  isConfigured(): boolean;
  getChannel(): string;
}

// CUSUM 通道默认基线 (无历史数据时使用)
const DEFAULT_BASELINES: Record<string, { mean: number; std: number }> = {
  temperature: { mean: 37.0, std: 0.5 },
  pH:          { mean: 7.0,  std: 0.1 },
  DO:          { mean: 30.0, std: 10.0 },
  pressure:    { mean: 0.5,  std: 0.05 },
  rpm:         { mean: 200,  std: 20 },
};

// CUSUM 全局配置 (h = 报警阈值, k = 漂移容许)
let cusumConfig = {
  h: 5,    // 宽松阈值, 减少误报
  k: 0.5,
};

export function getCusumConfig() { return cusumConfig; }
export function getDefaultBaselines() { return DEFAULT_BASELINES; }

/**
 * 初始化 CUSUM 检测器基线
 * 优先从 InfluxDB 历史数据计算, 无数据时使用默认值
 */
export function initCusumBaselines(
  detectors: Map<string, CUSUMDetectorLike>,
  historicalStats?: Record<string, { mean: number; std: number }>,
): void {
  for (const [channel, detector] of detectors) {
    const stats = historicalStats?.[channel] || DEFAULT_BASELINES[channel];
    if (stats) {
      detector.setBaseline(stats.mean, stats.std, cusumConfig.h, cusumConfig.k);
    }
  }
}

/**
 * 注册 CUSUM 路由
 */
export function registerCusumRoutes(
  router: Router,
  cusumDetectors: Map<string, Map<string, CUSUMDetectorLike>>,
  sqlite?: any,
): void {

  // GET /cusum/:batchId/history — 查询历史批次的离线 CUSUM 计算结果
  router.get('/cusum/:batchId/history', (req, res) => {
    const { batchId } = req.params;
    const channel = req.query.channel as string | undefined;
    const db = sqlite?.getDatabase?.() || sqlite;
    if (!db) return res.status(500).json({ error: 'SQLite 不可用' });

    try {
      let rows;
      if (channel) {
        rows = db.prepare(
          'SELECT channel, minute, timestamp, raw_value, normalized, cum_pos, cum_neg, anomaly FROM cusum_results WHERE batch_id = ? AND channel = ? ORDER BY minute',
        ).all(batchId, channel);
      } else {
        rows = db.prepare(
          'SELECT channel, minute, timestamp, raw_value, normalized, cum_pos, cum_neg, anomaly FROM cusum_results WHERE batch_id = ? ORDER BY channel, minute',
        ).all(batchId);
      }

      // 按通道分组
      const grouped: Record<string, any[]> = {};
      for (const r of rows as any[]) {
        if (!grouped[r.channel]) grouped[r.channel] = [];
        grouped[r.channel].push(r);
      }

      // 统计每通道的报警信息
      const summary: Record<string, { total: number; alarmCount: number; maxCumPos: number; maxCumNeg: number; firstAlarmMin: number | null }> = {};
      for (const [ch, pts] of Object.entries(grouped)) {
        const alarms = pts.filter((p: any) => p.anomaly);
        summary[ch] = {
          total: pts.length,
          alarmCount: alarms.length,
          maxCumPos: Math.max(...pts.map((p: any) => p.cum_pos)),
          maxCumNeg: Math.max(...pts.map((p: any) => p.cum_neg)),
          firstAlarmMin: alarms.length > 0 ? alarms[0].minute : null,
        };
      }

      res.json({ batchId, channels: grouped, summary, h: cusumConfig.h, k: cusumConfig.k });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /cusum/demo/overview — 所有 CUSUM 演示批次的汇总
  router.get('/cusum/demo/overview', (_req, res) => {
    const db = sqlite?.getDatabase?.() || sqlite;
    if (!db) return res.status(500).json({ error: 'SQLite 不可用' });

    try {
      const batches = db.prepare(`
        SELECT b.batch_id, b.outcome, b.notes, b.started_at, b.ended_at,
          COUNT(CASE WHEN cr.anomaly = 1 THEN 1 END) AS alarm_count,
          COUNT(DISTINCT CASE WHEN cr.anomaly = 1 THEN cr.channel END) AS alarm_channels,
          MAX(cr.cum_pos) AS max_cum_pos,
          MAX(cr.cum_neg) AS max_cum_neg
        FROM batches b
        LEFT JOIN cusum_results cr ON b.batch_id = cr.batch_id
        WHERE b.batch_id LIKE 'CUSUM-DEMO-%'
        GROUP BY b.batch_id
        ORDER BY b.started_at
      `).all();
      res.json({ batches, h: cusumConfig.h, k: cusumConfig.k });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /cusum/config — 返回当前阈值配置
  router.get('/cusum/config', (_req, res) => {
    res.json({
      ...cusumConfig,
      channels: Object.keys(DEFAULT_BASELINES),
      defaults: DEFAULT_BASELINES,
    });
  });

  // PUT /cusum/config — 更新阈值
  router.put('/cusum/config', (req, res) => {
    const { h, k } = req.body;
    if (typeof h === 'number' && h > 0) cusumConfig.h = h;
    if (typeof k === 'number' && k > 0) cusumConfig.k = k;

    // 更新所有已运行检测器的阈值
    for (const [, channelMap] of cusumDetectors) {
      for (const [channel, detector] of channelMap) {
        if (detector.isConfigured()) {
          const baseline = DEFAULT_BASELINES[channel];
          if (baseline) detector.setBaseline(baseline.mean, baseline.std, cusumConfig.h, cusumConfig.k);
        }
      }
    }

    res.json({ ok: true, config: cusumConfig });
  });

  // POST /cusum/:batchId/reset — 手动重置累积和 (操作员确认后)
  router.post('/cusum/:batchId/reset', (req, res) => {
    const { batchId } = req.params;
    const { channel } = req.body; // 可选: 只重置指定通道

    const channelMap = cusumDetectors.get(batchId);
    if (!channelMap) return res.status(404).json({ error: `批次 ${batchId} 无活跃CUSUM检测器` });

    if (channel) {
      const det = channelMap.get(channel);
      if (!det) return res.status(404).json({ error: `通道 ${channel} 不存在` });
      det.reset();
    } else {
      for (const det of channelMap.values()) det.reset();
    }

    res.json({ ok: true, batchId, channel: channel || 'all' });
  });

  // GET /cusum/:batchId/status — 当前检测器状态
  router.get('/cusum/:batchId/status', (req, res) => {
    const { batchId } = req.params;
    const channelMap = cusumDetectors.get(batchId);
    if (!channelMap) return res.status(404).json({ error: `批次 ${batchId} 无活跃CUSUM检测器` });

    const status: Record<string, any> = {};
    for (const [ch, det] of channelMap) {
      // 用 detect(0) 不改变状态的方式获取不了, 只能暴露配置状态
      status[ch] = { configured: det.isConfigured(), channel: det.getChannel() };
    }

    res.json({ batchId, detectors: status });
  });
}
