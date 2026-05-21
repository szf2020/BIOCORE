-- SP-RG-4: phase_instances table — middle layer between phase_templates (class)
-- and reactor_configs (unit). Lets one phase class be bound to one reactor
-- multiple times with distinct params_override per binding. Recipe graph nodes
-- reference an instance_id instead of inlining phase_type+params_override.

CREATE TABLE IF NOT EXISTS phase_instances (
  instance_id     TEXT PRIMARY KEY,
  phase_class     TEXT NOT NULL,
  reactor_id      TEXT NOT NULL,
  label           TEXT,
  params_override TEXT NOT NULL DEFAULT '{}',
  notes           TEXT DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by      TEXT DEFAULT 'unknown',
  FOREIGN KEY (phase_class) REFERENCES phase_templates(type),
  FOREIGN KEY (reactor_id) REFERENCES reactor_configs(reactor_id)
);

CREATE INDEX IF NOT EXISTS idx_phase_instances_class   ON phase_instances(phase_class);
CREATE INDEX IF NOT EXISTS idx_phase_instances_reactor ON phase_instances(reactor_id);
