REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA app AUTHORIZATION slidebi_owner;
SET LOCAL search_path = app, pg_catalog;

CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identity_provider text NOT NULL CHECK (length(identity_provider) BETWEEN 1 AND 100),
  external_subject text NOT NULL CHECK (length(external_subject) BETWEEN 1 AND 200),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_provider, external_subject)
);
CREATE TABLE storage_objects (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  storage_key text NOT NULL UNIQUE CHECK (length(storage_key) BETWEEN 1 AND 1024),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE assets (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 150),
  owner_id bigint REFERENCES users(id),
  visibility text NOT NULL CHECK (visibility IN ('builtin','private')),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image','icon')),
  original_object_id bigint NOT NULL REFERENCES storage_objects(id),
  thumbnail_object_id bigint REFERENCES storage_objects(id),
  provenance jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(provenance) = 'object'),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((visibility = 'builtin' AND owner_id IS NULL) OR (visibility = 'private' AND owner_id IS NOT NULL))
);
CREATE INDEX assets_owner_list ON assets(owner_id, created_at DESC, id) WHERE archived_at IS NULL;
CREATE INDEX assets_original ON assets(original_object_id);
CREATE INDEX assets_thumbnail ON assets(thumbnail_object_id) WHERE thumbnail_object_id IS NOT NULL;

CREATE TABLE data_snapshots (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 150),
  owner_id bigint NOT NULL REFERENCES users(id),
  data_spec_id text NOT NULL,
  spec_version text NOT NULL CHECK (spec_version = '1.0'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz NOT NULL,
  data_as_of timestamptz,
  consistency text NOT NULL CHECK (consistency IN ('fixture','importedSnapshot')),
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object' AND
    payload ?& ARRAY['mode','source','context','semanticSchema','measures','queries','resultSets'] AND
    NOT (payload ?| ARRAY['id','specVersion','snapshot']) AND
    (payload->>'mode' = 'snapshot') IS TRUE AND
    jsonb_typeof(payload->'resultSets') = 'array' AND
    jsonb_array_length(payload->'resultSets') > 0
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id)
);
CREATE INDEX snapshots_owner_list ON data_snapshots(owner_id, created_at DESC, id);
CREATE INDEX snapshots_hash ON data_snapshots(owner_id, content_hash);

CREATE TABLE themes (
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 150),
  version integer NOT NULL CHECK (version > 0),
  name text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND NOT (payload ?| ARRAY['id','version','name'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);
CREATE TABLE templates (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 150),
  owner_id bigint REFERENCES users(id),
  visibility text NOT NULL CHECK (visibility IN ('builtin','private')),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((visibility = 'builtin' AND owner_id IS NULL) OR (visibility = 'private' AND owner_id IS NOT NULL))
);
CREATE INDEX templates_owner ON templates(owner_id, created_at DESC, id) WHERE archived_at IS NULL;
CREATE TABLE template_versions (
  template_id text NOT NULL REFERENCES templates(id),
  version integer NOT NULL CHECK (version > 0),
  name text NOT NULL,
  scene text NOT NULL CHECK (scene IN ('budgetComparison','monthlyTrend','revenueBridge')),
  theme_id text NOT NULL,
  theme_version integer NOT NULL,
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object' AND
    payload ?& ARRAY['requiredBindings','canvas','slots','defaultElements','allowedControls','exportCapabilities'] AND
    NOT (payload ?| ARRAY['id','version','name','scene','themeRef','snapshotRef'])
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, version),
  FOREIGN KEY (theme_id, theme_version) REFERENCES themes(id, version)
);
CREATE INDEX template_versions_theme ON template_versions(theme_id, theme_version);
CREATE TABLE template_asset_refs (
  template_id text NOT NULL,
  template_version integer NOT NULL,
  asset_id text NOT NULL REFERENCES assets(id),
  PRIMARY KEY (template_id, template_version, asset_id),
  FOREIGN KEY (template_id, template_version) REFERENCES template_versions(template_id, version)
);
CREATE INDEX template_assets_reverse ON template_asset_refs(asset_id);

CREATE TABLE slides (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 150),
  owner_id bigint NOT NULL REFERENCES users(id),
  current_revision integer NOT NULL CHECK (current_revision > 0),
  creation_key text CHECK (length(creation_key) BETWEEN 1 AND 200),
  creation_hash text CHECK (creation_hash ~ '^[0-9a-f]{64}$'),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  UNIQUE (owner_id, creation_key),
  CHECK ((creation_key IS NULL) = (creation_hash IS NULL))
);
CREATE INDEX slides_owner_list ON slides(owner_id, updated_at DESC, id) WHERE archived_at IS NULL;
CREATE TABLE slide_revisions (
  slide_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  owner_id bigint NOT NULL,
  spec_version text NOT NULL CHECK (spec_version = '1.0'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  scene text NOT NULL CHECK (scene IN ('budgetComparison','monthlyTrend','revenueBridge')),
  snapshot_id text NOT NULL,
  template_id text NOT NULL,
  template_version integer NOT NULL,
  theme_id text NOT NULL,
  theme_version integer NOT NULL,
  review_state text NOT NULL CHECK (review_state IN ('notRequired','needsReview','reviewed')),
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object' AND
    payload ?& ARRAY['canvas','bindings','elements','annotations','layoutOverrides'] AND
    jsonb_typeof(payload->'elements') = 'array' AND
    NOT (payload ?| ARRAY['id','revision','specVersion','title','scene','snapshotRef','templateRef','themeRef','reviewState'])
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (slide_id, revision),
  FOREIGN KEY (slide_id, owner_id) REFERENCES slides(id, owner_id),
  FOREIGN KEY (snapshot_id, owner_id) REFERENCES data_snapshots(id, owner_id),
  FOREIGN KEY (template_id, template_version) REFERENCES template_versions(template_id, version),
  FOREIGN KEY (theme_id, theme_version) REFERENCES themes(id, version)
);
ALTER TABLE slides ADD CONSTRAINT slides_current_revision_fk
  FOREIGN KEY (id, current_revision) REFERENCES slide_revisions(slide_id, revision) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX revisions_snapshot ON slide_revisions(snapshot_id, owner_id);
CREATE INDEX revisions_template ON slide_revisions(template_id, template_version);
CREATE INDEX revisions_theme ON slide_revisions(theme_id, theme_version);
CREATE TABLE slide_asset_refs (
  slide_id text NOT NULL,
  revision integer NOT NULL,
  asset_id text NOT NULL REFERENCES assets(id),
  PRIMARY KEY (slide_id, revision, asset_id),
  FOREIGN KEY (slide_id, revision) REFERENCES slide_revisions(slide_id, revision)
);
CREATE INDEX slide_assets_reverse ON slide_asset_refs(asset_id);
CREATE TABLE template_favorites (
  owner_id bigint NOT NULL REFERENCES users(id),
  template_id text NOT NULL REFERENCES templates(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, template_id)
);
CREATE INDEX template_favorites_reverse ON template_favorites(template_id);
CREATE TABLE asset_favorites (
  owner_id bigint NOT NULL REFERENCES users(id),
  asset_id text NOT NULL REFERENCES assets(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, asset_id)
);
CREATE INDEX asset_favorites_reverse ON asset_favorites(asset_id);

CREATE TABLE export_jobs (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 150),
  owner_id bigint NOT NULL REFERENCES users(id),
  slide_id text NOT NULL,
  slide_revision integer NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('final','draft')),
  export_spec jsonb NOT NULL CHECK (
    jsonb_typeof(export_spec) = 'object' AND
    export_spec ?& ARRAY['exportSpecVersion','provenance','canvas','theme','assets','slides','navigation','diagnostics'] AND
    NOT (export_spec ?| ARRAY['jobId','inputHash','deliveryMode']) AND
    jsonb_typeof(export_spec->'slides') = 'array' AND
    jsonb_array_length(export_spec->'slides') = 1
  ),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  lease_expires_at timestamptz,
  error_code text,
  error_detail jsonb CHECK (error_detail IS NULL OR jsonb_typeof(error_detail) = 'object'),
  pptx_object_id bigint REFERENCES storage_objects(id),
  manifest_object_id bigint REFERENCES storage_objects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (owner_id, idempotency_key),
  FOREIGN KEY (slide_id, owner_id) REFERENCES slides(id, owner_id),
  FOREIGN KEY (slide_id, slide_revision) REFERENCES slide_revisions(slide_id, revision),
  CHECK (attempt_count <= max_attempts),
  CHECK ((status = 'running') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (status = 'running' OR (lease_token IS NULL AND lease_expires_at IS NULL)),
  CHECK ((status IN ('succeeded','failed','cancelled')) = (finished_at IS NOT NULL)),
  CHECK ((status = 'succeeded') = (pptx_object_id IS NOT NULL AND manifest_object_id IS NOT NULL)),
  CHECK (status = 'succeeded' OR (pptx_object_id IS NULL AND manifest_object_id IS NULL))
);
CREATE INDEX jobs_claim ON export_jobs(available_at, created_at, id) WHERE status = 'queued';
CREATE INDEX jobs_expired_lease ON export_jobs(lease_expires_at) WHERE status = 'running';
CREATE INDEX jobs_owner_list ON export_jobs(owner_id, created_at DESC, id);
CREATE INDEX jobs_slide_revision ON export_jobs(slide_id, slide_revision);
CREATE INDEX jobs_pptx ON export_jobs(pptx_object_id) WHERE pptx_object_id IS NOT NULL;
CREATE INDEX jobs_manifest ON export_jobs(manifest_object_id) WHERE manifest_object_id IS NOT NULL;

-- 大对象内容及发布版本不可 UPDATE；清理 DELETE 留给拥有者/迁移维护账号。
CREATE FUNCTION reject_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable row in %; create a new version', TG_TABLE_NAME; END;
$$;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['storage_objects','data_snapshots','themes','template_versions','slide_revisions','template_asset_refs','slide_asset_refs'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_update BEFORE UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_update()', table_name);
  END LOOP;
END $$;
CREATE FUNCTION guard_job_input() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['status','attempt_count','available_at','lease_token','lease_expires_at','error_code','error_detail','pptx_object_id','manifest_object_id','finished_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','attempt_count','available_at','lease_token','lease_expires_at','error_code','error_detail','pptx_object_id','manifest_object_id','finished_at']) THEN
    RAISE EXCEPTION 'export input is frozen; create a new job';
  END IF;
  IF OLD.status IN ('succeeded','failed','cancelled') THEN
    RAISE EXCEPTION 'terminal export job is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER frozen_job_input BEFORE UPDATE ON export_jobs FOR EACH ROW EXECUTE FUNCTION guard_job_input();

GRANT USAGE ON SCHEMA app TO slidebi_runtime;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA app TO slidebi_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO slidebi_runtime;
GRANT UPDATE (display_name, disabled_at) ON users TO slidebi_runtime;
GRANT UPDATE (name, archived_at) ON assets TO slidebi_runtime;
GRANT UPDATE (archived_at) ON templates TO slidebi_runtime;
GRANT UPDATE (current_revision, updated_at, archived_at) ON slides TO slidebi_runtime;
GRANT UPDATE (status, attempt_count, available_at, lease_token, lease_expires_at, error_code, error_detail, pptx_object_id, manifest_object_id, finished_at) ON export_jobs TO slidebi_runtime;
GRANT DELETE ON template_favorites, asset_favorites TO slidebi_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;

