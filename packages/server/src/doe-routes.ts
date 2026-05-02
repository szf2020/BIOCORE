// ============================================================
// doe-routes.ts — 试验设计 (DOE) API 路由
//
// 提供正交设计、均匀设计、极差分析、方差分析、回归分析等
// 实验设计与数据处理功能的 REST API.
//
// 路由前缀: /api/v1/doe
// ============================================================

import type { Router } from 'express';
import type { SQLiteService } from '@biocore/data-service';
import {
  generateOrthogonalDesign,
  listOrthogonalArrays,
  selectOrthogonalArray,
  rangeAnalysis,
  compositeScore,
  multiIndicatorRangeAnalysis,
  orthogonalAnova,
  orthogonalAnovaWithReplicates,
  generateUniformDesign,
  listUniformTables,
  createGoldenSearch,
  advanceGoldenSearch,
  createMultiFactorSearch,
  multipleRegression,
  quadraticSurfaceRegression,
  polynomialRegression,
  diagnoseResiduals,
} from '@biocore/experiment-optimizer';
import type {
  ExperimentResult,
  MultiIndicatorResult,
  ReplicatedResult,
  RegressionPoint,
  DOEFactor,
  IndicatorWeight,
  OptimizationGoal,
} from '@biocore/experiment-optimizer';

/**
 * 注册 DOE 路由
 */
export function registerDoeRoutes(
  router: Router,
  sqlite: SQLiteService,
): void {

  // ─── 正交设计 ─────────────────────────────────────────

  /** GET /doe/orthogonal/arrays — 列出所有可用正交表 */
  router.get('/doe/orthogonal/arrays', (_req, res) => {
    try {
      const arrays = listOrthogonalArrays();
      res.json({ arrays });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /doe/orthogonal/generate — 生成正交试验设计方案
   *
   * Body: {
   *   factors: [{ name: "温度", levels: [34, 37, 40], unit: "°C" }, ...],
   *   arrayName?: "L9(3⁴)",        // 可选, 不指定则自动选择
   *   columnAssignment?: { "温度": 0, "pH": 1, ... }  // 可选
   * }
   */
  router.post('/doe/orthogonal/generate', (req, res) => {
    try {
      const { factors, arrayName, columnAssignment } = req.body;
      if (!factors || !Array.isArray(factors) || factors.length === 0) {
        return res.status(400).json({ error: '缺少 factors 数组' });
      }
      const design = generateOrthogonalDesign(factors, arrayName, columnAssignment);
      res.json({ design });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * POST /doe/orthogonal/analyze — 正交试验分析 (极差 + 方差)
   *
   * Body: {
   *   factors: DOEFactor[],
   *   design: OrthogonalDesign,     // 来自 generate 的返回值
   *   results: [{ runIndex: 1, response: 12.5 }, ...],
   *   goal: "maximize" | "minimize",
   *   // 可选: 多指标
   *   multiResults?: [{ runIndex: 1, responses: { Y1: 12.5, Y2: 0.8 } }, ...],
   *   weights?: [{ name: "Y1", weight: 0.35, goal: "maximize" }, ...]
   * }
   */
  router.post('/doe/orthogonal/analyze', (req, res) => {
    try {
      const { factors, design, results, goal, multiResults, weights } = req.body;

      if (!factors || !design || (!results && !multiResults)) {
        return res.status(400).json({ error: '缺少 factors, design, results' });
      }

      const optimGoal: OptimizationGoal = goal || 'maximize';
      let rangeResult;
      let anovaResult;

      if (multiResults && weights) {
        // 多指标分析
        rangeResult = multiIndicatorRangeAnalysis(design, multiResults, factors, weights);
        // 方差分析用综合评分
        const scores = compositeScore(multiResults, weights);
        const singleResults: ExperimentResult[] = multiResults.map((r: MultiIndicatorResult, i: number) => ({
          runIndex: r.runIndex,
          response: scores[i].score,
        }));
        anovaResult = orthogonalAnova(design, singleResults, factors);
      } else {
        // 单指标分析
        rangeResult = rangeAnalysis(design, results, factors, optimGoal);
        anovaResult = orthogonalAnova(design, results, factors);
      }

      res.json({
        rangeAnalysis: rangeResult,
        anova: anovaResult,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── 均匀设计 ─────────────────────────────────────────

  /** GET /doe/uniform/tables — 列出所有可用均匀表 */
  router.get('/doe/uniform/tables', (_req, res) => {
    try {
      const tables = listUniformTables();
      res.json({ tables });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /doe/uniform/generate — 生成均匀试验设计方案
   *
   * Body: {
   *   factors: [{ name: "Kp", min: 4, max: 14, unit: "" }, ...],
   *   tableName?: "U7(7³)"
   * }
   */
  router.post('/doe/uniform/generate', (req, res) => {
    try {
      const { factors, tableName } = req.body;
      if (!factors || !Array.isArray(factors) || factors.length === 0) {
        return res.status(400).json({ error: '缺少 factors 数组' });
      }
      const design = generateUniformDesign(factors, tableName);
      res.json({ design });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── 回归分析 ─────────────────────────────────────────

  /**
   * POST /doe/regression/fit — 拟合回归模型
   *
   * Body: {
   *   points: [{ x: { temp: 37, pH: 7.0 }, y: 12.5 }, ...],
   *   xNames: ["temp", "pH"],
   *   modelType: "linear" | "quadratic" | "polynomial",
   *   degree?: 2      // 仅 polynomial 时需要
   * }
   */
  router.post('/doe/regression/fit', (req, res) => {
    try {
      const { points, xNames, modelType, degree } = req.body;
      if (!points || !Array.isArray(points) || points.length === 0) {
        return res.status(400).json({ error: '缺少 points 数组' });
      }

      let result;
      if (modelType === 'polynomial' && xNames?.length === 1) {
        const xValues = points.map((p: RegressionPoint) => p.x[xNames[0]] ?? 0);
        const yValues = points.map((p: RegressionPoint) => p.y);
        result = polynomialRegression(xValues, yValues, degree || 2, xNames[0]);
      } else if (modelType === 'quadratic') {
        result = quadraticSurfaceRegression(points, xNames);
      } else {
        result = multipleRegression(points, xNames);
      }

      if (!result) {
        return res.status(400).json({ error: '回归失败: 数据不足或矩阵奇异' });
      }

      const diagnostics = diagnoseResiduals(result);
      res.json({ regression: result, diagnostics });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── 黄金分割法 ───────────────────────────────────────

  /**
   * POST /doe/golden-section/next — 黄金分割法计算下一个试验点
   *
   * Body: {
   *   factorName: "temperature",
   *   min: 25, max: 42,
   *   goal: "maximize",
   *   evaluatedPoints: [{ x: 31.5, y: 12.0 }, { x: 35.5, y: 15.0 }],
   *   tolerance?: 0.05,
   *   maxIterations?: 10
   * }
   */
  router.post('/doe/golden-section/next', (req, res) => {
    try {
      const { factorName, min, max, goal, evaluatedPoints, tolerance, maxIterations } = req.body;
      if (!factorName || min === undefined || max === undefined) {
        return res.status(400).json({ error: '缺少 factorName, min, max' });
      }

      const optimGoal: OptimizationGoal = goal || 'maximize';
      let state = createGoldenSearch(factorName, min, max, optimGoal);

      // 回放已有试验点
      if (evaluatedPoints && Array.isArray(evaluatedPoints)) {
        for (const pt of evaluatedPoints) {
          state = advanceGoldenSearch(state, pt.x, pt.y, optimGoal, tolerance, maxIterations);
          if (state.converged) break;
        }
      }

      res.json({
        nextPoint: state.nextPoint,
        currentBest: state.currentBest,
        interval: state.interval,
        converged: state.converged,
        iteration: state.iteration,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── 实验计划 CRUD ────────────────────────────────────

  /** GET /doe/experiments — 列出所有实验计划 */
  router.get('/doe/experiments', (_req, res) => {
    try {
      const db = (sqlite as any).db;
      if (!db) return res.json({ experiments: [] });

      // 检查表是否存在
      const tableCheck = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='doe_experiments'"
      ).get();
      if (!tableCheck) return res.json({ experiments: [] });

      const experiments = db.prepare(
        'SELECT * FROM doe_experiments ORDER BY created_at DESC'
      ).all();
      res.json({ experiments });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /doe/experiments — 创建实验计划
   *
   * Body: {
   *   name: "正交试验-温度pH优化",
   *   designType: "orthogonal" | "uniform" | "golden_section",
   *   factors: DOEFactor[] | JSON string,
   *   design: object,  // 设计方案 (JSON)
   *   status?: "planned" | "running" | "completed"
   * }
   */
  router.post('/doe/experiments', (req, res) => {
    try {
      const db = (sqlite as any).db;
      if (!db) return res.status(500).json({ error: '数据库不可用' });

      ensureDoeTable(db);

      const { name, designType, factors, design, status } = req.body;
      if (!name || !designType) {
        return res.status(400).json({ error: '缺少 name 或 designType' });
      }

      const id = `DOE-${Date.now()}`;
      db.prepare(`
        INSERT INTO doe_experiments (id, name, design_type, factors_json, design_json, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        id,
        name,
        designType,
        JSON.stringify(factors),
        JSON.stringify(design),
        status || 'planned',
      );

      res.json({ id, message: '实验计划已创建' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PUT /doe/experiments/:id/results — 更新实验结果
   *
   * Body: {
   *   results: [{ runIndex: 1, response: 12.5 }, ...],
   *   status?: "completed"
   * }
   */
  router.put('/doe/experiments/:id/results', (req, res) => {
    try {
      const db = (sqlite as any).db;
      if (!db) return res.status(500).json({ error: '数据库不可用' });

      const { results, status } = req.body;
      db.prepare(`
        UPDATE doe_experiments
        SET results_json = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        JSON.stringify(results),
        status || 'completed',
        req.params.id,
      );

      res.json({ message: '实验结果已更新' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /doe/experiments/:id/link-batch — 关联批次
   *
   * Body: { runIndex: 1, batchId: "BATCH-001" }
   */
  router.post('/doe/experiments/:id/link-batch', (req, res) => {
    try {
      const db = (sqlite as any).db;
      if (!db) return res.status(500).json({ error: '数据库不可用' });

      const { runIndex, batchId } = req.body;
      if (!runIndex || !batchId) {
        return res.status(400).json({ error: '缺少 runIndex 或 batchId' });
      }

      // 在 doe_experiment_batches 表中记录
      ensureDoeLinksTable(db);
      db.prepare(`
        INSERT OR REPLACE INTO doe_experiment_batches (experiment_id, run_index, batch_id, linked_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(req.params.id, runIndex, batchId);

      res.json({ message: '批次已关联' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── 数据库表创建 ─────────────────────────────────────────

function ensureDoeTable(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS doe_experiments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      design_type TEXT NOT NULL CHECK(design_type IN ('orthogonal', 'uniform', 'golden_section', 'factorial', 'ccd')),
      factors_json TEXT,
      design_json TEXT,
      results_json TEXT,
      analysis_json TEXT,
      status TEXT DEFAULT 'planned' CHECK(status IN ('planned', 'running', 'completed', 'archived')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    )
  `);
}

function ensureDoeLinksTable(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS doe_experiment_batches (
      experiment_id TEXT NOT NULL,
      run_index INTEGER NOT NULL,
      batch_id TEXT NOT NULL,
      linked_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (experiment_id, run_index),
      FOREIGN KEY (experiment_id) REFERENCES doe_experiments(id)
    )
  `);
}
