ALTER TABLE app.assets ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
-- original_object_id remains the normalized PNG used by render/export consumers.
ALTER TABLE app.assets ADD COLUMN source_object_id bigint REFERENCES app.storage_objects(id);
GRANT UPDATE(tags) ON app.assets TO slidebi_runtime;
