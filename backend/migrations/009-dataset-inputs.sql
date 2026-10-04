ALTER TABLE app.datasets ADD COLUMN archived_at timestamptz;
ALTER TABLE app.datasets ADD COLUMN scope_result_set_ids text[];
ALTER TABLE app.datasets ADD COLUMN split_from_id text REFERENCES app.datasets(id);
ALTER TABLE app.datasets ADD COLUMN split_completed_at timestamptz;
CREATE INDEX datasets_active ON app.datasets(owner_id,updated_at DESC) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX datasets_split_scope ON app.datasets(split_from_id,scope_result_set_ids) WHERE split_from_id IS NOT NULL;
GRANT UPDATE(archived_at,scope_result_set_ids,split_from_id,split_completed_at) ON app.datasets TO slidebi_runtime;
