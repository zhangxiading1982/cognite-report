ALTER TABLE app.folders DROP CONSTRAINT folders_kind_check;
ALTER TABLE app.folders ADD CONSTRAINT folders_kind_check CHECK(kind IN('data','assets','templates'));
ALTER TABLE app.templates ADD COLUMN folder_id text REFERENCES app.folders(id);
CREATE INDEX templates_folder ON app.templates(folder_id);
GRANT UPDATE(folder_id) ON app.templates TO slidebi_runtime;
ALTER TABLE app.assets DROP CONSTRAINT assets_kind_check;
ALTER TABLE app.assets ADD CONSTRAINT assets_kind_check CHECK(kind IN('image','icon','vector'));
