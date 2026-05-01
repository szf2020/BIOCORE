-- ═══ AI报告会话扩展 ═══
-- 为 ai_sessions 表添加报告生成所需字段

ALTER TABLE ai_sessions ADD COLUMN session_type TEXT DEFAULT 'chat';
ALTER TABLE ai_sessions ADD COLUMN report_data TEXT;
ALTER TABLE ai_sessions ADD COLUMN messages TEXT;
ALTER TABLE ai_sessions ADD COLUMN updated_at TEXT;
