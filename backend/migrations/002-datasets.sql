CREATE TABLE app.datasets (
 id text PRIMARY KEY, owner_id bigint NOT NULL REFERENCES app.users(id), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), current_snapshot_id text NOT NULL,
 origin jsonb NOT NULL, upstream_hash text, sync_status text NOT NULL DEFAULT 'current', last_checked_at timestamptz, last_synced_at timestamptz, sync_error text,
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,owner_id),
 FOREIGN KEY(current_snapshot_id,owner_id) REFERENCES app.data_snapshots(id,owner_id)
);
CREATE TABLE app.dataset_versions (
 dataset_id text NOT NULL REFERENCES app.datasets(id), version integer NOT NULL, name text NOT NULL, snapshot_id text NOT NULL REFERENCES app.data_snapshots(id), operation text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(dataset_id,version), UNIQUE(snapshot_id)
);
INSERT INTO app.datasets(id,owner_id,name,current_snapshot_id,origin,updated_at)
 SELECT 'dataset-'||md5(id),owner_id,COALESCE(NULLIF(payload->>'name',''),data_spec_id),id,jsonb_build_object('kind','legacyUnknown','importedAt',created_at),created_at FROM app.data_snapshots;
INSERT INTO app.dataset_versions(dataset_id,version,name,snapshot_id,operation,created_at)
 SELECT id,1,name,current_snapshot_id,'import',updated_at FROM app.datasets;
ALTER TABLE app.slides ADD COLUMN dataset_id text;
UPDATE app.slides s SET dataset_id=d.id FROM app.slide_revisions r JOIN app.datasets d ON d.current_snapshot_id=r.snapshot_id WHERE r.slide_id=s.id AND r.revision=s.current_revision;
ALTER TABLE app.slides ADD CONSTRAINT slides_dataset_fk FOREIGN KEY(dataset_id,owner_id) REFERENCES app.datasets(id,owner_id);
CREATE INDEX slides_dataset ON app.slides(dataset_id);
CREATE FUNCTION app.guard_dataset_origin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.origin IS DISTINCT FROM OLD.origin OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'dataset origin is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_origin BEFORE UPDATE ON app.datasets FOR EACH ROW EXECUTE FUNCTION app.guard_dataset_origin();
CREATE TRIGGER immutable_update BEFORE UPDATE ON app.dataset_versions FOR EACH ROW EXECUTE FUNCTION app.reject_update();
GRANT SELECT,INSERT,UPDATE ON app.datasets TO slidebi_runtime;
GRANT SELECT,INSERT ON app.dataset_versions TO slidebi_runtime;
GRANT UPDATE(dataset_id) ON app.slides TO slidebi_runtime;
