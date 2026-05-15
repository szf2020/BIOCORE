-- SCADA dispatch state machine: pending_dispatch → dispatching → dispatched|failed
ALTER TABLE ai_suggestions ADD COLUMN dispatch_status TEXT;
ALTER TABLE ai_suggestions ADD COLUMN dispatch_retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_suggestions ADD COLUMN dispatched_at TEXT;
ALTER TABLE ai_suggestions ADD COLUMN dispatch_error TEXT;
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_pending_dispatch
  ON ai_suggestions(dispatch_status)
  WHERE dispatch_status IN ('pending_dispatch', 'dispatching');
