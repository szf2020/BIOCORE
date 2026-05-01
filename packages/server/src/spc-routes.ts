// ============================================================
// spc-routes.ts — SPC 统计过程控制
//
// 参考 DELMIA Apriso Quality 模块 + 《试验设计与数据处理》:
//   - Individual/X-bar 控制图
//   - 西电失控规则 (Western Electric Rules)
//   - 过程能力指数 Cp/Cpk
// ============================================================

import type { Router } from 'express';
import type { SQLiteService } from '../../data-service/src/sqlite-service';

// ─── SPC 计算纯函数 ──────────────────────────────────────

/** 从数据点计算控制限 (Individual 图, 3σ 法) */
export function calculateControlLimits(values: number[]): {
  cl: number; ucl: number; lcl: number; sigma: number;
} | null {
  if (values.length < 3) return null;
  const n = values.length;
  const cl = values.reduce((a, b) => a + b, 0) / n;
  const sigma = Math.sqrt(values.reduce((s, v) => s + (v - cl) ** 2, 0) / (n - 1));
  return {
    cl: round(cl, 4),
    ucl: round(cl + 3 * sigma, 4),
    lcl: round(cl - 3 * sigma, 4),
    sigma: round(sigma, 4),
  };
}

/** 过程能力指数 */
export function calculateCapability(
  values: number[],
  usl: number | null,
  lsl: number | null,
): { cp: number | null; cpk: number | null; pp: number | null; ppk: number | null; sigma: number } | null {
  if (values.length < 3) return null;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sigma = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  if (sigma === 0) return { cp: null, cpk: null, pp: null, ppk: null, sigma: 0 };

  let cp: number | null = null;
  let cpk: number | null = null;
  if (usl !== null && lsl !== null) {
    cp = round((usl - lsl) / (6 * sigma), 3);
    cpk = round(Math.min((usl - mean) / (3 * sigma), (mean - lsl) / (3 * sigma)), 3);
  } else if (usl !== null) {
    cpk = round((usl - mean) / (3 * sigma), 3);
  } else if (lsl !== null) {
    cpk = round((mean - lsl) / (3 * sigma), 3);
  }

  return { cp, cpk, pp: cp, ppk: cpk, sigma: round(sigma, 4) };
}

/**
 * 西电失控规则 (Western Electric Rules)
 * 返回违反的规则列表
 */
export function checkWesternElectricRules(
  values: number[],
  cl: number,
  sigma: number,
): { index: number; rules: string[] }[] {
  if (values.length < 2 || sigma === 0) return [];
  const results: { index: number; rules: string[] }[] = [];

  for (let i = 0; i < values.length; i++) {
    const rules: string[] = [];
    const v = values[i];
    const z = (v - cl) / sigma; // 标准化偏差

    // Rule 1: 单点超过 3σ
    if (Math.abs(z) > 3) rules.push('rule1');

    // Rule 2: 连续 9 点在中心线同侧
    if (i >= 8) {
      const side = values.slice(i - 8, i + 1).every(x => x > cl) ||
                   values.slice(i - 8, i + 1).every(x => x < cl);
      if (side) rules.push('rule2');
    }

    // Rule 3: 连续 6 点单调递增或递减
    if (i >= 5) {
      const window = values.slice(i - 5, i + 1);
      const increasing = window.every((x, j) => j === 0 || x > window[j - 1]);
      const decreasing = window.every((x, j) => j === 0 || x < window[j - 1]);
      if (increasing || decreasing) rules.push('rule3');
    }

    // Rule 4: 连续 14 点交替升降
    if (i >= 13) {
      const window = values.slice(i - 13, i + 1);
      let alternating = true;
      for (let j = 2; j < window.length; j++) {
        const prev = window[j - 1] - window[j - 2];
        const curr = window[j] - window[j - 1];
        if (prev * curr >= 0) { alternating = false; break; }
      }
      if (alternating) rules.push('rule4');
    }

    if (rules.length > 0) {
      results.push({ index: i, rules });
    }
  }
  return results;
}

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

// ─── X-bar R 图计算 (参考 PySpc: xbar_r) ──────────────────

/** SPC 常数表 (子组 n=2~10) */
const SPC_CONSTANTS: Record<number, { A2: number; D3: number; D4: number; A3: number; c4: number; B3: number; B4: number }> = {
  2:  { A2: 1.880, D3: 0,     D4: 3.267, A3: 2.659, c4: 0.7979, B3: 0,     B4: 3.267 },
  3:  { A2: 1.023, D3: 0,     D4: 2.575, A3: 1.954, c4: 0.8862, B3: 0,     B4: 2.568 },
  4:  { A2: 0.729, D3: 0,     D4: 2.282, A3: 1.628, c4: 0.9213, B3: 0,     B4: 2.266 },
  5:  { A2: 0.577, D3: 0,     D4: 2.115, A3: 1.427, c4: 0.9400, B3: 0,     B4: 2.089 },
  6:  { A2: 0.483, D3: 0,     D4: 2.004, A3: 1.287, c4: 0.9515, B3: 0.030, B4: 1.970 },
  7:  { A2: 0.419, D3: 0.076, D4: 1.924, A3: 1.182, c4: 0.9594, B3: 0.118, B4: 1.882 },
  8:  { A2: 0.373, D3: 0.136, D4: 1.864, A3: 1.099, c4: 0.9650, B3: 0.185, B4: 1.815 },
  9:  { A2: 0.337, D3: 0.184, D4: 1.816, A3: 1.032, c4: 0.9693, B3: 0.239, B4: 1.761 },
  10: { A2: 0.308, D3: 0.223, D4: 1.777, A3: 0.975, c4: 0.9727, B3: 0.284, B4: 1.716 },
};

/** X-bar R 图控制限 (子组均值 + 极差) */
export function calculateXbarRLimits(subgroups: number[][]): {
  xbar_cl: number; xbar_ucl: number; xbar_lcl: number;
  r_cl: number; r_ucl: number; r_lcl: number;
  xbar_values: number[]; r_values: number[];
} | null {
  if (subgroups.length < 3) return null;
  const n = subgroups[0]?.length ?? 0;
  if (n < 2 || n > 10) return null;
  const constants = SPC_CONSTANTS[n];

  // 各子组均值和极差
  const xbars = subgroups.map(sg => sg.reduce((a, b) => a + b, 0) / sg.length);
  const ranges = subgroups.map(sg => Math.max(...sg) - Math.min(...sg));

  // 总均值和平均极差
  const xbar_cl = xbars.reduce((a, b) => a + b, 0) / xbars.length;
  const r_cl = ranges.reduce((a, b) => a + b, 0) / ranges.length;

  return {
    xbar_cl: round(xbar_cl, 4), xbar_ucl: round(xbar_cl + constants.A2 * r_cl, 4), xbar_lcl: round(xbar_cl - constants.A2 * r_cl, 4),
    r_cl: round(r_cl, 4), r_ucl: round(constants.D4 * r_cl, 4), r_lcl: round(constants.D3 * r_cl, 4),
    xbar_values: xbars.map(v => round(v, 4)), r_values: ranges.map(v => round(v, 4)),
  };
}

// ─── EWMA 图计算 (参考 PySpc: ewma) ──────────────────────

/** EWMA (指数加权移动平均) 控制图, 检测小偏移 */
export function calculateEWMALimits(
  values: number[],
  lambda: number = 0.2,
  L: number = 3,
): { cl: number; points: { ewma: number; ucl: number; lcl: number }[]; sigma: number } | null {
  if (values.length < 3) return null;
  const n = values.length;
  const cl = values.reduce((a, b) => a + b, 0) / n;
  const sigma = Math.sqrt(values.reduce((s, v) => s + (v - cl) ** 2, 0) / (n - 1));

  const points: { ewma: number; ucl: number; lcl: number }[] = [];
  let ewma = cl;

  for (let i = 0; i < n; i++) {
    ewma = lambda * values[i] + (1 - lambda) * ewma;
    // UCL/LCL 随 i 变化 (前几点较窄, 逐渐趋于稳态)
    const factor = L * sigma * Math.sqrt((lambda / (2 - lambda)) * (1 - Math.pow(1 - lambda, 2 * (i + 1))));
    points.push({
      ewma: round(ewma, 4),
      ucl: round(cl + factor, 4),
      lcl: round(cl - factor, 4),
    });
  }

  return { cl: round(cl, 4), points, sigma: round(sigma, 4) };
}

// ─── p 图计算 (不合格品率, 参考 PySpc: p_chart) ──────────

export function calculatePChartLimits(data: { defective: number; total: number }[]): {
  cl: number; ucl: number; lcl: number;
  values: number[];
} | null {
  if (data.length < 3) return null;
  const totalD = data.reduce((s, d) => s + d.defective, 0);
  const totalN = data.reduce((s, d) => s + d.total, 0);
  const pBar = totalD / totalN; // 平均不合格品率
  const nBar = totalN / data.length; // 平均样本量
  const sigma = Math.sqrt(pBar * (1 - pBar) / nBar);

  return {
    cl: round(pBar, 4),
    ucl: round(Math.min(1, pBar + 3 * sigma), 4),
    lcl: round(Math.max(0, pBar - 3 * sigma), 4),
    values: data.map(d => round(d.total > 0 ? d.defective / d.total : 0, 4)),
  };
}

// ─── c 图计算 (缺陷数, 参考 PySpc: c_chart) ──────────────

export function calculateCChartLimits(counts: number[]): {
  cl: number; ucl: number; lcl: number;
} | null {
  if (counts.length < 3) return null;
  const cBar = counts.reduce((a, b) => a + b, 0) / counts.length;
  return {
    cl: round(cBar, 4),
    ucl: round(cBar + 3 * Math.sqrt(cBar), 4),
    lcl: round(Math.max(0, cBar - 3 * Math.sqrt(cBar)), 4),
  };
}

// ─── SPC 可用参数定义 ─────────────────────────────────────

/** 支持的图表类型 */
export type SpcChartType = 'individual' | 'xbar_r' | 'ewma' | 'p' | 'c';

const SPC_PARAMETERS: Record<string, { label: string; source: 'kpi' | 'sample' | 'influx'; field: string; chartTypes: SpcChartType[] }> = {
  titer:        { label: '产物浓度 (g/L)',   source: 'sample', field: 'product_titer', chartTypes: ['individual', 'xbar_r', 'ewma'] },
  OD600:        { label: '菌密度 OD600',    source: 'sample', field: 'OD600',          chartTypes: ['individual', 'xbar_r', 'ewma'] },
  acetate:      { label: '乙酸 (g/L)',      source: 'sample', field: 'acetate_g_L',   chartTypes: ['individual', 'ewma'] },
  glucose:      { label: '葡萄糖 (g/L)',    source: 'sample', field: 'glucose_g_L',   chartTypes: ['individual', 'ewma'] },
  yield:        { label: '产量 (g)',         source: 'kpi',    field: 'yield_g',        chartTypes: ['individual', 'ewma'] },
  oee:          { label: 'OEE',             source: 'kpi',    field: 'oee_pct',        chartTypes: ['individual', 'ewma'] },
  cycle_time:   { label: '周期时间 (h)',     source: 'kpi',    field: 'cycle_time_h',   chartTypes: ['individual', 'ewma'] },
  downtime:     { label: '停机时间 (min)',   source: 'kpi',    field: 'downtime_min',   chartTypes: ['individual', 'ewma', 'c'] },
  batch_quality:{ label: '批次合格率',       source: 'kpi',    field: 'quality_pct',    chartTypes: ['p'] },
  alarm_count:  { label: '报警次数',         source: 'kpi',    field: 'alarm_count',    chartTypes: ['c'] },
};

// ─── 路由注册 ──────────────────────────────────────────────

export function registerSpcRoutes(
  router: Router,
  sqlite: SQLiteService,
): void {
  const db = () => (sqlite as any).db || sqlite.getDatabase();

  /** GET /spc/parameters — 可用 SPC 参数列表 (含支持的图表类型) */
  router.get('/spc/parameters', (_req, res) => {
    res.json(Object.entries(SPC_PARAMETERS).map(([key, v]) => ({ key, ...v })));
  });

  /** GET /spc/charts/:parameter — 控制图数据 (支持 chart_type 参数) */
  router.get('/spc/charts-ext/:parameter', (req, res) => {
    try {
      const paramName = req.params.parameter;
      const chartType = (req.query.chart_type as SpcChartType) || 'individual';
      const paramDef = SPC_PARAMETERS[paramName];
      if (!paramDef) return res.status(400).json({ error: `未知参数: ${paramName}` });

      // Individual 图走原有逻辑
      if (chartType === 'individual') {
        const limit: any = db().prepare('SELECT * FROM spc_control_limits WHERE parameter_name = ? ORDER BY valid_from DESC LIMIT 1').get(paramName);
        const points = db().prepare('SELECT * FROM spc_data_points WHERE parameter_name = ? ORDER BY recorded_at ASC').all(paramName);
        return res.json({ parameter: paramName, label: paramDef.label, chart_type: 'individual', limits: limit ? { ucl: limit.ucl, cl: limit.cl, lcl: limit.lcl, usl: limit.usl, lsl: limit.lsl } : null, points });
      }

      // 获取原始数据
      const values = getParameterValues(db(), paramName, paramDef);
      if (values.length < 3) return res.status(400).json({ error: `数据不足: ${values.length} 个点` });

      if (chartType === 'ewma') {
        const ewma = calculateEWMALimits(values.map(v => v.value));
        if (!ewma) return res.status(400).json({ error: 'EWMA 计算失败' });
        return res.json({
          parameter: paramName, label: paramDef.label, chart_type: 'ewma',
          cl: ewma.cl, sigma: ewma.sigma,
          points: values.map((v, i) => ({
            batch_id: v.batchId, raw_value: v.value,
            ewma: ewma.points[i].ewma, ucl: ewma.points[i].ucl, lcl: ewma.points[i].lcl,
            out_of_control: ewma.points[i].ewma > ewma.points[i].ucl || ewma.points[i].ewma < ewma.points[i].lcl ? 1 : 0,
          })),
        });
      }

      if (chartType === 'p') {
        // p 图: 从 batch_kpis 获取 quality_pct 转为 defective/total
        const pData = values.map(v => ({ defective: v.value < 1 ? 1 : 0, total: 1 }));
        const pLimits = calculatePChartLimits(pData);
        if (!pLimits) return res.status(400).json({ error: 'p 图计算失败' });
        return res.json({
          parameter: paramName, label: paramDef.label, chart_type: 'p',
          limits: { ucl: pLimits.ucl, cl: pLimits.cl, lcl: pLimits.lcl },
          points: values.map((v, i) => ({
            batch_id: v.batchId, value: pLimits.values[i],
            out_of_control: pLimits.values[i] > pLimits.ucl || pLimits.values[i] < pLimits.lcl ? 1 : 0,
          })),
        });
      }

      if (chartType === 'c') {
        const counts = values.map(v => v.value);
        const cLimits = calculateCChartLimits(counts);
        if (!cLimits) return res.status(400).json({ error: 'c 图计算失败' });
        return res.json({
          parameter: paramName, label: paramDef.label, chart_type: 'c',
          limits: { ucl: cLimits.ucl, cl: cLimits.cl, lcl: cLimits.lcl },
          points: values.map(v => ({
            batch_id: v.batchId, value: v.value,
            out_of_control: v.value > cLimits.ucl || v.value < cLimits.lcl ? 1 : 0,
          })),
        });
      }

      if (chartType === 'xbar_r') {
        // X-bar R: 暂时每批次视为 n=1 子组 (单值), 未来支持子组取样
        // 此处模拟: 将连续 3 个点组成一个子组
        const subgroupSize = 3;
        const subgroups: number[][] = [];
        const subgroupBatchIds: string[] = [];
        for (let i = 0; i + subgroupSize <= values.length; i += subgroupSize) {
          subgroups.push(values.slice(i, i + subgroupSize).map(v => v.value));
          subgroupBatchIds.push(values.slice(i, i + subgroupSize).map(v => v.batchId).join(','));
        }
        const xbarr = calculateXbarRLimits(subgroups);
        if (!xbarr) return res.status(400).json({ error: 'X-bar R 计算失败' });
        return res.json({
          parameter: paramName, label: paramDef.label, chart_type: 'xbar_r',
          xbar: { ucl: xbarr.xbar_ucl, cl: xbarr.xbar_cl, lcl: xbarr.xbar_lcl, values: xbarr.xbar_values },
          r: { ucl: xbarr.r_ucl, cl: xbarr.r_cl, lcl: xbarr.r_lcl, values: xbarr.r_values },
          subgroup_batch_ids: subgroupBatchIds,
        });
      }

      res.status(400).json({ error: `不支持的图表类型: ${chartType}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /spc/limits — 列出控制限 */
  router.get('/spc/limits', (req, res) => {
    try {
      const { parameter_name } = req.query;
      let sql = 'SELECT * FROM spc_control_limits';
      const params: any[] = [];
      if (parameter_name) { sql += ' WHERE parameter_name = ?'; params.push(parameter_name); }
      sql += ' ORDER BY valid_from DESC';
      res.json(db().prepare(sql).all(...params));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** POST /spc/limits — 手动创建控制限 */
  router.post('/spc/limits', (req, res) => {
    try {
      const { parameter_name, chart_type, ucl, cl, lcl, usl, lsl, created_by } = req.body;
      if (!parameter_name || ucl === undefined || cl === undefined || lcl === undefined) {
        return res.status(400).json({ error: '缺少必要字段' });
      }
      db().prepare(`
        INSERT INTO spc_control_limits (parameter_name, chart_type, ucl, cl, lcl, usl, lsl, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(parameter_name, chart_type || 'individual', ucl, cl, lcl, usl ?? null, lsl ?? null, created_by || 'system');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /spc/limits/calculate — 从历史批次自动计算控制限
   * Body: { parameter_name, batch_ids?: string[], created_by }
   * 若不指定 batch_ids, 取最近 20 个已完成批次
   */
  router.post('/spc/limits/calculate', (req, res) => {
    try {
      const { parameter_name, batch_ids, usl, lsl, created_by } = req.body;
      if (!parameter_name) return res.status(400).json({ error: '缺少 parameter_name' });

      const paramDef = SPC_PARAMETERS[parameter_name];
      if (!paramDef) return res.status(400).json({ error: `未知参数: ${parameter_name}` });

      // 获取数据值
      const values = getParameterValues(db(), parameter_name, paramDef, batch_ids);
      if (values.length < 3) {
        return res.status(400).json({ error: `数据不足: 仅有 ${values.length} 个点, 至少需要 3 个` });
      }

      const limits = calculateControlLimits(values.map(v => v.value));
      if (!limits) return res.status(400).json({ error: '计算失败' });

      // 存入数据库
      db().prepare(`
        INSERT INTO spc_control_limits (parameter_name, chart_type, ucl, cl, lcl, usl, lsl, based_on_batches, created_by)
        VALUES (?, 'individual', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        parameter_name, limits.ucl, limits.cl, limits.lcl,
        usl ?? null, lsl ?? null,
        JSON.stringify(values.map(v => v.batchId)),
        created_by || 'system',
      );

      // 同时评估所有数据点并写入 spc_data_points
      const violations = checkWesternElectricRules(values.map(v => v.value), limits.cl, limits.sigma);
      const violationMap = new Map(violations.map(v => [v.index, v.rules]));

      const insert = db().prepare(`
        INSERT OR REPLACE INTO spc_data_points (parameter_name, batch_id, value, out_of_control, rules_violated)
        VALUES (?, ?, ?, ?, ?)
      `);
      const tx = db().transaction(() => {
        values.forEach((v, i) => {
          const rules = violationMap.get(i);
          insert.run(parameter_name, v.batchId, v.value, rules ? 1 : 0, rules ? JSON.stringify(rules) : null);
        });
      });
      tx();

      res.json({ limits, dataPointCount: values.length, outOfControlCount: violations.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /spc/charts/:parameter — 控制图数据 */
  router.get('/spc/charts/:parameter', (req, res) => {
    try {
      const paramName = req.params.parameter;

      // 最新控制限
      const limit: any = db().prepare(
        'SELECT * FROM spc_control_limits WHERE parameter_name = ? ORDER BY valid_from DESC LIMIT 1'
      ).get(paramName);

      // 数据点
      const points = db().prepare(
        'SELECT * FROM spc_data_points WHERE parameter_name = ? ORDER BY recorded_at ASC'
      ).all(paramName);

      res.json({
        parameter: paramName,
        label: SPC_PARAMETERS[paramName]?.label || paramName,
        limits: limit ? {
          ucl: limit.ucl, cl: limit.cl, lcl: limit.lcl,
          usl: limit.usl, lsl: limit.lsl,
        } : null,
        points,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /spc/capability/:parameter — 过程能力 Cp/Cpk */
  router.get('/spc/capability/:parameter', (req, res) => {
    try {
      const paramName = req.params.parameter;
      const paramDef = SPC_PARAMETERS[paramName];
      if (!paramDef) return res.status(400).json({ error: `未知参数: ${paramName}` });

      // 获取最新控制限 (取 USL/LSL)
      const limit: any = db().prepare(
        'SELECT usl, lsl FROM spc_control_limits WHERE parameter_name = ? ORDER BY valid_from DESC LIMIT 1'
      ).get(paramName);

      // 获取所有数据点
      const points: any[] = db().prepare(
        'SELECT value FROM spc_data_points WHERE parameter_name = ? ORDER BY recorded_at ASC'
      ).all(paramName);

      if (points.length < 3) {
        return res.status(400).json({ error: `数据不足: ${points.length} 个点` });
      }

      const values = points.map((p: any) => p.value);
      const cap = calculateCapability(values, limit?.usl ?? null, limit?.lsl ?? null);

      res.json({
        parameter: paramName,
        label: SPC_PARAMETERS[paramName]?.label || paramName,
        n: values.length,
        ...cap,
        // 能力等级颜色
        cpk_grade: cap && cap.cpk !== null
          ? (cap.cpk >= 1.33 ? 'excellent' : cap.cpk >= 1.0 ? 'acceptable' : 'poor')
          : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /spc/evaluate/:batchId — 评估新批次并写入 SPC 数据点
   */
  router.post('/spc/evaluate/:batchId', (req, res) => {
    try {
      const batchId = req.params.batchId;
      const results: Record<string, any> = {};

      for (const [paramName, paramDef] of Object.entries(SPC_PARAMETERS)) {
        // 获取该批次的值
        const val = getSingleBatchValue(db(), batchId, paramName, paramDef);
        if (val === null) continue;

        // 获取控制限
        const limit: any = db().prepare(
          'SELECT cl, ucl, lcl FROM spc_control_limits WHERE parameter_name = ? ORDER BY valid_from DESC LIMIT 1'
        ).get(paramName);
        if (!limit) continue;

        // 获取历史数据 (加上本批次) 评估西电规则
        const historicalPoints: any[] = db().prepare(
          'SELECT value FROM spc_data_points WHERE parameter_name = ? ORDER BY recorded_at ASC'
        ).all(paramName);
        const allValues = [...historicalPoints.map((p: any) => p.value), val];
        const sigma = (limit.ucl - limit.cl) / 3;
        const violations = checkWesternElectricRules(allValues, limit.cl, sigma);
        const lastViolation = violations.find(v => v.index === allValues.length - 1);

        // 写入
        db().prepare(`
          INSERT OR REPLACE INTO spc_data_points (parameter_name, batch_id, value, out_of_control, rules_violated)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          paramName, batchId, val,
          lastViolation ? 1 : 0,
          lastViolation ? JSON.stringify(lastViolation.rules) : null,
        );

        results[paramName] = {
          value: val,
          out_of_control: !!lastViolation,
          rules_violated: lastViolation?.rules || [],
        };
      }

      res.json({ batch_id: batchId, evaluations: results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── 数据获取辅助函数 ─────────────────────────────────────

function getParameterValues(
  db: any,
  paramName: string,
  paramDef: { source: string; field: string },
  batchIds?: string[],
): { batchId: string; value: number }[] {
  if (paramDef.source === 'kpi') {
    let sql = `SELECT batch_id as batchId, ${paramDef.field} as value FROM batch_kpis WHERE ${paramDef.field} IS NOT NULL`;
    if (batchIds && batchIds.length > 0) {
      sql += ` AND batch_id IN (${batchIds.map(() => '?').join(',')})`;
      return db.prepare(sql + ' ORDER BY calculated_at ASC').all(...batchIds);
    }
    return db.prepare(sql + ' ORDER BY calculated_at ASC LIMIT 50').all();
  }

  if (paramDef.source === 'sample') {
    // 每批次取最后一个样品的对应字段
    let sql = `SELECT s.batch_id as batchId, s.${paramDef.field} as value
      FROM offline_samples s
      INNER JOIN (
        SELECT batch_id, MAX(sample_time) as max_time
        FROM offline_samples
        WHERE ${paramDef.field} IS NOT NULL
        GROUP BY batch_id
      ) latest ON s.batch_id = latest.batch_id AND s.sample_time = latest.max_time
      WHERE s.${paramDef.field} IS NOT NULL`;
    if (batchIds && batchIds.length > 0) {
      sql += ` AND s.batch_id IN (${batchIds.map(() => '?').join(',')})`;
      return db.prepare(sql + ' ORDER BY s.sample_time ASC').all(...batchIds);
    }
    return db.prepare(sql + ' ORDER BY s.sample_time ASC LIMIT 50').all();
  }

  return [];
}

function getSingleBatchValue(
  db: any,
  batchId: string,
  paramName: string,
  paramDef: { source: string; field: string },
): number | null {
  if (paramDef.source === 'kpi') {
    const row: any = db.prepare(
      `SELECT ${paramDef.field} as value FROM batch_kpis WHERE batch_id = ?`
    ).get(batchId);
    return row?.value ?? null;
  }
  if (paramDef.source === 'sample') {
    const row: any = db.prepare(
      `SELECT ${paramDef.field} as value FROM offline_samples WHERE batch_id = ? AND ${paramDef.field} IS NOT NULL ORDER BY sample_time DESC LIMIT 1`
    ).get(batchId);
    return row?.value ?? null;
  }
  return null;
}
