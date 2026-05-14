-- ============================================================
-- BIOCore Demo Seed
-- 用途: 演示/开发环境初始化 — 4 反应器 + 5 完整配方
-- 用法: sqlite3 packages/server/data/biocore.db < scripts/seed-demo.sql
--      或: pnpm seed:demo
-- 注意: 服务器 DATA_DIR='./data' 相对路径 + cwd=packages/server,
--      所以服务器 DB 路径是 packages/server/data/biocore.db, 不是 repo 根 ./data
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
    {"phase_id":"P01","type":"cip","params":{"duration_min":15,"water_temp_C":40,"rinse_cycles":2}},
    {"phase_id":"P02","type":"cip","params":{"duration_min":30,"naoh_pct":1.0,"clean_temp_C":80}},
    {"phase_id":"P03","type":"sip","params":{"duration_min":30,"sip_temp_C":121,"pressure_kPa":205}},
    {"phase_id":"P04","type":"temp_control","params":{"target_temp_C":37,"max_duration_min":45}},
    {"phase_id":"P05","type":"water_fill","params":{"medium_id":"CD-CHO","volume_L":3.5,"warmup_min":15}},
    {"phase_id":"P06","type":"manual_add","params":{"seed_volume_L":0.5,"cell_density_e6":0.5,"hold_min":10}},
    {"phase_id":"P07","type":"fermentation","params":{"setpoint_temp_C":37,"setpoint_pH":7.0,"setpoint_DO_pct":40,"rpm":150,"duration_h":72}},
    {"phase_id":"P08","type":"feeding","params":{"setpoint_temp_C":33,"feed_id":"CD-FeedB","feed_rate_mL_h":12,"duration_h":96}},
    {"phase_id":"P09","type":"discharge","params":{"chill_temp_C":15,"chill_duration_min":30,"transfer_rate_L_min":0.5}},
    {"phase_id":"P10","type":"cip","params":{"duration_min":20,"water_temp_C":40,"rinse_cycles":3}}
  ]',
  'draft',
  1,
  0,
  'admin'
);

-- ── 配方 2: E.coli BL21(DE3) IPTG 诱导产重组蛋白 ──
INSERT OR IGNORE INTO recipes
  (recipe_id, version, name, author, target_organism,
   vessel_config, phases, status, dag_schema_version, is_template, created_by)
VALUES (
  'EC-BL21-001', '1.0.0', 'E.coli BL21(DE3) IPTG 诱导产蛋白 (5L)',
  'admin', 'E.coli BL21(DE3)',
  '{"id":"F02","working_volume_L":4}',
  '[
    {"phase_id":"P01","type":"cip","params":{"duration_min":12,"water_temp_C":40}},
    {"phase_id":"P02","type":"sip","params":{"duration_min":25,"sip_temp_C":121,"pressure_kPa":205}},
    {"phase_id":"P03","type":"temp_control","params":{"target_temp_C":37,"max_duration_min":30}},
    {"phase_id":"P04","type":"water_fill","params":{"medium_id":"LB-Kan","volume_L":3.0}},
    {"phase_id":"P05","type":"manual_add","params":{"seed_volume_L":0.3,"od600":0.1}},
    {"phase_id":"P06","type":"fermentation","params":{"setpoint_temp_C":37,"setpoint_pH":7.0,"setpoint_DO_pct":30,"rpm":400,"duration_h":4,"target_od600":0.8}},
    {"phase_id":"P07","type":"feeding","params":{"setpoint_temp_C":25,"iptg_mM":0.5,"duration_h":16,"rpm":350}},
    {"phase_id":"P08","type":"discharge","params":{"chill_temp_C":10,"chill_duration_min":20}},
    {"phase_id":"P09","type":"discharge","params":{"transfer_rate_L_min":1.0}},
    {"phase_id":"P10","type":"cip","params":{"duration_min":15,"naoh_pct":2.0}}
  ]',
  'draft', 1, 0, 'admin'
);

-- ── 配方 3: 酿酒酵母 乙醇发酵 (8 phases, 简化无诱导期) ──
INSERT OR IGNORE INTO recipes
  (recipe_id, version, name, author, target_organism,
   vessel_config, phases, status, dag_schema_version, is_template, created_by)
VALUES (
  'SC-ETOH-001', '1.0.0', '酿酒酵母 乙醇发酵 (5L)',
  'admin', 'S.cerevisiae',
  '{"id":"F03","working_volume_L":4.5}',
  '[
    {"phase_id":"P01","type":"cip","params":{"duration_min":15}},
    {"phase_id":"P02","type":"sip","params":{"duration_min":30,"sip_temp_C":121}},
    {"phase_id":"P03","type":"temp_control","params":{"target_temp_C":30}},
    {"phase_id":"P04","type":"water_fill","params":{"medium_id":"YPD-glucose-200","volume_L":4.0}},
    {"phase_id":"P05","type":"manual_add","params":{"seed_volume_L":0.5,"cell_density_e6":5}},
    {"phase_id":"P06","type":"fermentation","params":{"setpoint_temp_C":30,"setpoint_pH":4.5,"rpm":120,"duration_h":48,"anaerobic":true}},
    {"phase_id":"P07","type":"discharge","params":{"chill_temp_C":8,"chill_duration_min":40}},
    {"phase_id":"P08","type":"cip","params":{"duration_min":18,"naoh_pct":1.5}}
  ]',
  'draft', 1, 0, 'admin'
);

-- ── 配方 4: CHO 灌流培养 (高密度连续灌流) ──
INSERT OR IGNORE INTO recipes
  (recipe_id, version, name, author, target_organism,
   vessel_config, phases, status, dag_schema_version, is_template, created_by)
VALUES (
  'CHO-PERF-001', '1.0.0', 'CHO 高密度灌流培养 (5L)',
  'admin', 'CHO-DG44',
  '{"id":"F04","working_volume_L":3.5}',
  '[
    {"phase_id":"P01","type":"cip","params":{"duration_min":15,"rinse_cycles":3}},
    {"phase_id":"P02","type":"cip","params":{"duration_min":35,"naoh_pct":1.0}},
    {"phase_id":"P03","type":"sip","params":{"duration_min":35,"sip_temp_C":121}},
    {"phase_id":"P04","type":"temp_control","params":{"target_temp_C":37}},
    {"phase_id":"P05","type":"water_fill","params":{"medium_id":"CD-Perf-Base","volume_L":3.0}},
    {"phase_id":"P06","type":"manual_add","params":{"seed_volume_L":0.5,"cell_density_e6":1.0}},
    {"phase_id":"P07","type":"fermentation","params":{"setpoint_temp_C":37,"setpoint_pH":7.1,"setpoint_DO_pct":50,"rpm":180,"duration_h":48}},
    {"phase_id":"P08","type":"feeding","params":{"setpoint_temp_C":37,"vvd":1.0,"bleed_rate_mL_h":15,"target_density_e6":80,"duration_d":14}},
    {"phase_id":"P09","type":"discharge","params":{"chill_temp_C":12,"clarification":"depth_filter"}},
    {"phase_id":"P10","type":"cip","params":{"duration_min":25,"naoh_pct":1.5,"rinse_cycles":3}}
  ]',
  'draft', 1, 0, 'admin'
);

-- ── 配方 5: HEK293 病毒颗粒生产 ──
INSERT OR IGNORE INTO recipes
  (recipe_id, version, name, author, target_organism,
   vessel_config, phases, status, dag_schema_version, is_template, created_by)
VALUES (
  'HEK-VLP-001', '1.0.0', 'HEK293 病毒颗粒 (VLP) 生产 (5L)',
  'admin', 'HEK293T',
  '{"id":"F01","working_volume_L":3.5}',
  '[
    {"phase_id":"P01","type":"cip","params":{"duration_min":15}},
    {"phase_id":"P02","type":"sip","params":{"duration_min":30,"sip_temp_C":121}},
    {"phase_id":"P03","type":"temp_control","params":{"target_temp_C":37}},
    {"phase_id":"P04","type":"water_fill","params":{"medium_id":"Expi293","volume_L":3.0}},
    {"phase_id":"P05","type":"manual_add","params":{"seed_volume_L":0.5,"cell_density_e6":2.0}},
    {"phase_id":"P06","type":"fermentation","params":{"setpoint_temp_C":37,"setpoint_pH":7.1,"setpoint_DO_pct":40,"rpm":120,"duration_h":48,"target_density_e6":5.0}},
    {"phase_id":"P07","type":"manual_add","params":{"plasmid_ug_mL":1.0,"pei_ratio":3,"duration_h":4}},
    {"phase_id":"P08","type":"fermentation","params":{"setpoint_temp_C":35,"setpoint_pH":7.0,"duration_h":72,"feed_id":"glucose-stock-200"}},
    {"phase_id":"P09","type":"discharge","params":{"chill_temp_C":10,"clarification":"centrifuge","rpm_clarify":4000}},
    {"phase_id":"P10","type":"cip","params":{"duration_min":25,"naoh_pct":2.0}}
  ]',
  'draft', 1, 0, 'admin'
);

COMMIT;

-- ── 验证输出 ──
SELECT '反应器:' AS section;
SELECT reactor_id, name, vessel_volume_L, enabled FROM reactor_configs ORDER BY sort_order;
SELECT '配方:' AS section;
SELECT recipe_id, version, name, status, json_array_length(phases) AS phase_count FROM recipes ORDER BY recipe_id;
