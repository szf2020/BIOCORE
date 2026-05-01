-- 018: DOE 最优配方回链字段
ALTER TABLE doe_studies ADD COLUMN optimal_recipe_id TEXT;
ALTER TABLE doe_studies ADD COLUMN optimal_recipe_version TEXT;
ALTER TABLE doe_studies ADD COLUMN optimal_response TEXT;
ALTER TABLE doe_studies ADD COLUMN optimal_predicted REAL;
