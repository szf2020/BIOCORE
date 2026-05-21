-- SP-PLC-1: plc_reactor_bindings — 一个 unit 一个 PLC 的 1:1 绑定专表
-- (PK = plc_id 保证 1 PLC ≤ 1 binding;reactor_id 不加 UNIQUE,
-- 允许应用层警告但不强阻 — 见 用户选项 "否 (应用层警告)")

CREATE TABLE IF NOT EXISTS plc_reactor_bindings (
  plc_id      TEXT PRIMARY KEY,
  reactor_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by  TEXT DEFAULT 'unknown',
  FOREIGN KEY (reactor_id) REFERENCES reactor_configs(reactor_id)
);

CREATE INDEX IF NOT EXISTS idx_plc_bindings_reactor ON plc_reactor_bindings(reactor_id);
