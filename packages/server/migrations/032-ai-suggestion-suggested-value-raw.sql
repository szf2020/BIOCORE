-- SP6.6: store non-numeric write-intent values
-- ai_suggestions.suggested_value is REAL and silently drops boolean/string
-- write-intent values. Add a sibling TEXT column that holds the JSON-encoded
-- raw primitive (number/string/boolean), preserving queryability while
-- keeping the existing numeric column for back-compat with old consumers.
ALTER TABLE ai_suggestions ADD COLUMN suggested_value_raw TEXT;
