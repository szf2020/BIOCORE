-- ============================================================
-- BIOCore Demo Seed
-- 用途: 演示/开发环境初始化 — 4 反应器 + 1 完整配方 (10 phases)
-- 用法: sqlite3 data/biocore.db < scripts/seed-demo.sql
--      或: pnpm seed:demo
-- 幂等: INSERT OR REPLACE 用于反应器, INSERT OR IGNORE 用于配方 (PK 冲突跳过)
-- ============================================================

BEGIN;

-- ── 4 反应器: F01..F04 5L 研发罐组 ──
INSERT OR REPLACE INTO reactor_configs
  (reactor_id, name, description, vessel_volume_L, plc_protocol,
   plc_ip, plc_port, plc_rack, plc_slot, heartbeat_write, heartbeat_read,
   enabled, sort_order, category)
VALUES
  ('F01', '5L研发罐 #1', '种子培养罐组首位', 5, 's7',
   '192.168.2.11', 102, 0, 1, 'VB400', 'VB401', 1, 0, 'fermenter'),
  ('F02', '5L研发罐 #2', '种子培养罐组次位', 5, 's7',
   '192.168.2.12', 102, 0, 1, 'VB400', 'VB401', 1, 1, 'fermenter'),
  ('F03', '5L研发罐 #3', '生产规模实验罐', 5, 's7',
   '192.168.2.13', 102, 0, 1, 'VB400', 'VB401', 1, 2, 'fermenter'),
  ('F04', '5L研发罐 #4', '生产规模实验罐 (备用)', 5, 's7',
   '192.168.2.14', 102, 0, 1, 'VB400', 'VB401', 1, 3, 'fermenter');

-- ── 1 完整配方: CHO-PROD-001 v1.0.0 含 10 phases ──
--   线性 schema_version=1 (老编辑器兼容)
--   phases JSON 数组: P01..P10 典型 CHO 分批补料发酵生命周期
INSERT OR IGNORE INTO recipes
  (recipe_id, version, name, author, target_organism,
   vessel_config, phases, status, dag_schema_version,
   is_template, created_by)
VALUES (
  'CHO-PROD-001',
  '1.0.0',
  'CHO 细胞分批补料发酵 (5L)',
  'admin',
  'CHO-K1',
  '{"id":"F01","working_volume_L":5}',
  '[
    {"phase_id":"P01","type":"cip_rinse","params":{"duration_min":15,"water_temp_C":40,"rinse_cycles":2}},
    {"phase_id":"P02","type":"cip_clean","params":{"duration_min":30,"naoh_pct":1.0,"clean_temp_C":80}},
    {"phase_id":"P03","type":"sip","params":{"duration_min":30,"sip_temp_C":121,"pressure_kPa":205}},
    {"phase_id":"P04","type":"cooling","params":{"target_temp_C":37,"max_duration_min":45}},
    {"phase_id":"P05","type":"medium_charge","params":{"medium_id":"CD-CHO","volume_L":3.5,"warmup_min":15}},
    {"phase_id":"P06","type":"inoculate","params":{"seed_volume_L":0.5,"cell_density_e6":0.5,"hold_min":10}},
    {"phase_id":"P07","type":"growth","params":{"setpoint_temp_C":37,"setpoint_pH":7.0,"setpoint_DO_pct":40,"rpm":150,"duration_h":72}},
    {"phase_id":"P08","type":"induction","params":{"setpoint_temp_C":33,"feed_id":"CD-FeedB","feed_rate_mL_h":12,"duration_h":96}},
    {"phase_id":"P09","type":"harvest","params":{"chill_temp_C":15,"chill_duration_min":30,"transfer_rate_L_min":0.5}},
    {"phase_id":"P10","type":"post_cip","params":{"duration_min":20,"water_temp_C":40,"rinse_cycles":3}}
  ]',
  'draft',
  1,
  0,
  'admin'
);

COMMIT;

-- ── 验证输出 ──
SELECT '反应器:' AS section;
SELECT reactor_id, name, vessel_volume_L, enabled FROM reactor_configs ORDER BY sort_order;
SELECT '配方:' AS section;
SELECT recipe_id, version, name, status, json_array_length(phases) AS phase_count FROM recipes WHERE recipe_id='CHO-PROD-001';
