ALTER TABLE app.datasets
  ADD COLUMN data_id text GENERATED ALWAYS AS ('d_' || md5(id)) STORED;

CREATE UNIQUE INDEX datasets_data_id_unique ON app.datasets(data_id);
ALTER TABLE app.datasets
  ADD CONSTRAINT datasets_data_id_format CHECK(data_id ~ '^d_[0-9a-f]{32}$');
