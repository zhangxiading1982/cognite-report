ALTER TABLE app.datasets ADD COLUMN refresh_config jsonb CHECK(refresh_config IS NULL OR jsonb_typeof(refresh_config)='object');
ALTER TABLE app.dataset_versions ADD COLUMN refresh_config jsonb CHECK(refresh_config IS NULL OR jsonb_typeof(refresh_config)='object');
GRANT UPDATE(refresh_config) ON app.datasets TO slidebi_runtime;
