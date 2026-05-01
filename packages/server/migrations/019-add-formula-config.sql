-- 019: 计算参数公式配置表
CREATE TABLE IF NOT EXISTS formula_configs (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'standard' CHECK(category IN ('standard','custom')),
  formula_type  TEXT NOT NULL DEFAULT 'parametric' CHECK(formula_type IN ('parametric','expression')),
  formula_display TEXT,
  coefficients  TEXT,
  expression    TEXT,
  input_vars    TEXT,
  output_unit   TEXT,
  is_enabled    INTEGER NOT NULL DEFAULT 1,
  updated_by    TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 默认公式数据 (11 个参数)
INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('kLa', '容积传质系数 kLa', 'Van''t Riet 经验关联式', 'kLa = C × (P/V)^a × Vs^b × 3600',
 '{"C":0.026,"a":0.4,"b":0.5,"tankArea":0.02,"rpmRef":200,"pvMultiplier":0.1}',
 '["rpm","airflow"]', '1/h');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('OUR', '摄氧速率 OUR', '基于 kLa 和溶氧差计算', 'OUR = kLa × (DO* - DO) / 100',
 '{"DOStar":100}',
 '["DO","kLa"]', 'mmol/L/h');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('mu', '比生长速率 μ', 'OUR 对数导数法 (滑动窗口)', 'μ = d(ln OUR) / dt',
 '{"windowSize":5}',
 '["OUR"]', '1/h');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('F0', '灭菌值 F₀', 'SIP 灭菌累积当量', 'F₀ = Σ 10^((T - Tref) / z) / 60',
 '{"Tref":121,"z":10,"threshold":100}',
 '["temperature"]', 'min');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('Vs', '表观气速 Vs', '气体流量 / 罐截面积', 'Vs = (Q / 1000 / 60) / A',
 '{"tankArea":0.02}',
 '["airflow"]', 'm/s');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('PV', '单位体积功率 P/V', '搅拌功率简化计算', 'P/V = (rpm / rpmRef)^3 × multiplier',
 '{"rpmRef":200,"multiplier":0.1}',
 '["rpm"]', 'W/m³');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('cumFeed', '累积补料量', '补料泵流量积分', 'V_feed = Σ(rate / 60)',
 '{"pumpChannel":"P02","intervalSec":60}',
 '["feed_P02"]', 'mL');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('cumBase', '累积补碱量', '碱泵流量积分', 'V_base = Σ(rate / 60)',
 '{"pumpChannel":"P01","intervalSec":60}',
 '["feed_P01"]', 'mL');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('cumAcid', '累积补酸量', '酸泵流量积分', 'V_acid = Σ(rate / 60)',
 '{"pumpChannel":"P04","intervalSec":60}',
 '["feed_P04"]', 'mL');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('O2total', '累积耗氧量', 'OUR × 液体体积 时间积分', 'O₂_total = Σ(OUR × V_liquid × Δt)',
 '{}',
 '["OUR","V_liquid"]', 'mmol');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('Vliquid', '液体体积', '初始体积 + 累积添加量', 'V_liquid = V₀ + (V_feed + V_base + V_acid) / 1000',
 '{"initialVolume":5.0,"density":1.0}',
 '["cumFeed","cumBase","cumAcid"]', 'L');

-- 发酵动力学计算参数 (CER/RQ/OTR/qp/Yxs/Yps)
INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('CER', 'CO₂释放速率 CER', '尾气CO₂浓度差法计算，无尾气分析仪时用RQ×OUR估算',
 'CER = F_air × (CO₂_out - CO₂_in) / V_liquid / 22.4 × 60',
 '{"CO2_in":0.04,"estimateFromRQ":true,"defaultRQ":1.0}',
 '["airflow","OUR","Vliquid"]', 'mmol/L/h');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('RQ', '呼吸商 RQ', 'CER/OUR 比值，反映代谢状态 (=1 糖有氧, >1 溢流代谢)',
 'RQ = CER / OUR',
 '{}',
 '["CER","OUR"]', '(无量纲)');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('OTR', '传氧速率 OTR', '气液传质驱动的氧传递速率，稳态时 OTR ≈ OUR',
 'OTR = kLa × (DO* - DO) / 100 × C*',
 '{"DOStar":100,"CStar":0.21}',
 '["kLa","DO"]', 'mmol/L/h');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('qp', '比生产率 qp', '单位生物量的产物生成速率 (需离线样品)',
 'qp = ΔP / (X̄ × Δt)',
 '{"productField":"product_titer","biomassField":"OD600","OD_to_DCW":0.3}',
 '["product_titer","OD600"]', 'g/(g·h)');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('Yxs', '底物转化率 Yxs', '生物量对底物的转化率 (需离线样品)',
 'Yxs = ΔX / ΔS',
 '{"biomassField":"OD600","substrateField":"glucose_g_L","OD_to_DCW":0.3}',
 '["OD600","glucose_g_L"]', 'g/g');

INSERT OR IGNORE INTO formula_configs (id, name, description, formula_display, coefficients, input_vars, output_unit) VALUES
('Yps', '产物转化率 Yps', '产物对底物的转化率 (需离线样品)',
 'Yps = ΔP / ΔS',
 '{"productField":"product_titer","substrateField":"glucose_g_L"}',
 '["product_titer","glucose_g_L"]', 'g/g');
