-- ============================================================
-- 009-add-doe-studies.sql
-- DoE (Design of Experiments) 双向对接 — 参照 DASware design
--
-- 表结构:
--   doe_studies — 每个 DoE 研究 (含因子/响应定义 + 基础配方引用)
--   doe_runs    — 每个研究的运行 (设计矩阵行, 含因子值 + 生成的 recipe_id + batch_id + 响应值)
--
-- 流程 (双向):
--   1. 定义 study (factors + responses + base_recipe)
--   2. 生成设计矩阵 → 写入 doe_runs (status='pending', factor_values 已填)
--   3. materialize: 对每个 run 从 base_recipe 克隆出 {base}_DOE_{study}_{idx} 配方,
--      把 factor_values 注入到对应参数路径
--   4. 执行批次 → 绑定 batch_id 到 run (status='running')
--   5. 批次完成 → 自动或手动回填 response_values (status='completed')
--   6. 拟合模型 + 找最优 → 可生成新的"最优配方"给下一轮实验
-- ============================================================

CREATE TABLE IF NOT EXISTS doe_studies (
  study_id              TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT,
  base_recipe_id        TEXT,
  base_recipe_version   TEXT,
  design_type           TEXT NOT NULL
                        CHECK(design_type IN ('full_factorial','ccd','latin_hypercube','bayesian')),
  -- factors JSON: [{ name, path, min, max, levels?, center? }]
  factors               TEXT NOT NULL,
  -- responses JSON: [{ name, source, goal:'max'|'min'|'target', target? }]
  responses             TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK(status IN ('draft','designed','running','completed','archived')),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  created_by            TEXT NOT NULL,
  updated_at            TEXT,
  FOREIGN KEY (base_recipe_id, base_recipe_version) REFERENCES recipes(recipe_id, version)
);

CREATE INDEX IF NOT EXISTS idx_doe_studies_status  ON doe_studies(status);
CREATE INDEX IF NOT EXISTS idx_doe_studies_created ON doe_studies(created_at DESC);

CREATE TABLE IF NOT EXISTS doe_runs (
  run_id            TEXT PRIMARY KEY,
  study_id          TEXT NOT NULL,
  run_index         INTEGER NOT NULL,
  factor_values     TEXT NOT NULL,          -- JSON: { factor_name: number }
  recipe_id         TEXT,                   -- 从 base_recipe 克隆的子配方 ID (materialize 后填)
  recipe_version    TEXT,
  batch_id          TEXT,                   -- 执行时绑定
  response_values   TEXT,                   -- JSON: { response_name: number }
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','recipe_generated','running','completed','failed')),
  started_at        TEXT,
  completed_at      TEXT,
  notes             TEXT,
  FOREIGN KEY (study_id) REFERENCES doe_studies(study_id) ON DELETE CASCADE,
  UNIQUE (study_id, run_index)
);

CREATE INDEX IF NOT EXISTS idx_doe_runs_study ON doe_runs(study_id, run_index);
CREATE INDEX IF NOT EXISTS idx_doe_runs_batch ON doe_runs(batch_id);
