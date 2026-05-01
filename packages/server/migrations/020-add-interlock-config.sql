-- 020: IL/RF 连锁故障可配置化
CREATE TABLE IF NOT EXISTS interlock_configs (
  id            TEXT PRIMARY KEY,
  category      TEXT NOT NULL CHECK(category IN ('IL','RF')),
  name          TEXT NOT NULL,
  description   TEXT,
  check_type    TEXT NOT NULL DEFAULT 'tag_compare',
  plc_tags      TEXT,
  condition     TEXT,
  duration_sec  INTEGER DEFAULT 0,
  severity      TEXT DEFAULT 'critical' CHECK(severity IN ('critical','warning','info')),
  hold_action   TEXT,
  display_name  TEXT,
  is_enabled    INTEGER DEFAULT 1,
  is_system     INTEGER DEFAULT 1,
  sort_order    INTEGER DEFAULT 0,
  updated_by    TEXT,
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- IL 启动连锁 (10项)
INSERT OR IGNORE INTO interlock_configs VALUES ('IL-01','IL','传感器信号有效','所有AI通道信号有效(>=0)','tag_compare','["TEMP_PV","JACKET_PV","PH_PV","DO_PV","PRESSURE_PV","AIRFLOW_PV"]','{"operator":"all_gte","value":0}',0,'critical',NULL,NULL,1,1,1,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('IL-02','IL','变频器无故障','VFD故障码=0','tag_compare','["VFD_FAULT_CODE"]','{"operator":"==","value":0}',0,'critical',NULL,NULL,1,1,2,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('IL-03','IL','蒸汽阀关闭','蒸汽阀处于关闭位','tag_compare','["STEAM_VALVE_CLOSED"]','{"operator":"==","value":1}',0,'critical',NULL,NULL,1,1,3,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('IL-04','IL','冷却阀关闭','冷却阀处于关闭位','tag_compare','["COOL_VALVE_CLOSED"]','{"operator":"==","value":1}',0,'critical',NULL,NULL,1,1,4,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('IL-05','IL','急停未按下','急停按钮未触发','tag_compare','["ESTOP"]','{"operator":"==","value":0}',0,'critical',NULL,NULL,1,1,5,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('IL-06','IL','罐盖锁定','罐盖限位开关已锁','tag_compare','["LID_LOCKED"]','{"operator":"==","value":1}',0,'critical',NULL,NULL,1,1,6,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('IL-07','IL','PLC心跳有效','PLC心跳值1s内变化','tag_compare','["HEARTBEAT"]','{"operator":"must_change"}',0,'critical',NULL,NULL,1,1,7,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('IL-08','IL','配方已审批','配方状态为approved','software','[]','{"operator":"software","check":"recipe_approved"}',0,'critical',NULL,NULL,1,1,8,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('IL-09','IL','数据库可写','SQLite/InfluxDB可写','software','[]','{"operator":"software","check":"db_writable"}',0,'critical',NULL,NULL,1,1,9,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('IL-10','IL','蒸汽供气正常','蒸汽供气压力>0.5bar','tag_compare','["STEAM_PRESSURE_SW"]','{"operator":"==","value":1}',0,'warning',NULL,NULL,1,1,10,NULL,datetime('now'));

-- RF 运行故障 (10项)
INSERT OR IGNORE INTO interlock_configs VALUES ('RF-01','RF','变频器故障','VFD故障码非零','tag_compare','["VFD_FAULT_CODE"]','{"operator":"!=","value":0}',0,'critical','搅拌急停',NULL,1,1,11,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('RF-02','RF','VFD通讯超时','VFD连续3次无响应','tag_compare','["VFD_FAULT_CODE"]','{"operator":"consecutive_undefined","count":3}',0,'critical','搅拌急停',NULL,1,1,12,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('RF-03','RF','温度偏差过大','|PV-SV|>阈值 持续N秒','tag_compare','["TEMP_PV","TEMP_SV"]','{"operator":"abs_diff_gt","threshold":2}',180,'critical','温度PID继续运行',NULL,1,1,13,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('RF-04','RF','pH偏差过大','|PV-SV|>阈值 且泵满速','tag_compare','["PH_PV","PH_SV","P01_RATE","P04_RATE"]','{"operator":"abs_diff_gt","threshold":0.5,"pump_threshold":40}',300,'critical','补料泵停',NULL,1,1,14,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('RF-05','RF','DO过低','DO<阈值 持续N秒','tag_compare','["DO_PV"]','{"operator":"<","value":5}',300,'critical','补料泵停',NULL,1,1,15,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('RF-06','RF','罐压过高','罐压>阈值','tag_compare','["PRESSURE_PV"]','{"operator":">","value":2.5}',0,'critical','排气阀全开, 蒸汽阀关',NULL,1,1,16,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('RF-07','RF','传感器断线','通道原始值<阈值(断线)','tag_compare','["TEMP_PV_RAW","PH_PV_RAW","DO_PV_RAW","PRESSURE_PV_RAW","AIRFLOW_PV_RAW"]','{"operator":"any_lt","value":100}',0,'warning',NULL,NULL,1,1,17,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('RF-08','RF','传感器饱和','通道原始值>阈值(饱和)','tag_compare','["TEMP_PV_RAW","PH_PV_RAW","DO_PV_RAW","PRESSURE_PV_RAW","AIRFLOW_PV_RAW"]','{"operator":"any_gt","value":28000}',0,'warning',NULL,NULL,1,1,18,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('RF-09','RF','称重无变化(泵运行中)','补料泵运行但称重30min无变化','tag_compare','["WEIGHT_PV","P02_RATE"]','{"operator":"no_change","threshold":0.01,"condition_tag":"P02_RATE","condition_op":">","condition_value":0}',1800,'warning','补料泵停',NULL,1,1,19,NULL,datetime('now'));
INSERT OR IGNORE INTO interlock_configs VALUES ('RF-10','RF','疑似泡沫事件','称重突增>5%且所有泵关停','tag_compare','["WEIGHT_PV"]','{"operator":"spike_pct","threshold":0.05,"all_pumps_off":true}',0,'warning','消泡泵P04脉冲5s',NULL,1,1,20,NULL,datetime('now'));
