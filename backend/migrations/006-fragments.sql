CREATE TABLE app.fragments (
  id text PRIMARY KEY,
  owner_id bigint NOT NULL REFERENCES app.users(id),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  tags text[] NOT NULL DEFAULT '{}' CHECK(cardinality(tags) <= 12),
  spec jsonb NOT NULL CHECK(
    jsonb_typeof(spec) = 'object' AND
    spec ?& ARRAY['elements','bindings','themeRef'] AND
    jsonb_typeof(spec->'elements') = 'array' AND
    jsonb_array_length(spec->'elements') BETWEEN 1 AND 50 AND
    jsonb_typeof(spec->'bindings') = 'object' AND
    jsonb_typeof(spec->'themeRef') = 'object'
  ),
  source_slide_id text NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  FOREIGN KEY(source_slide_id,owner_id) REFERENCES app.slides(id,owner_id),
  FOREIGN KEY(source_slide_id,source_revision) REFERENCES app.slide_revisions(slide_id,revision)
);
CREATE INDEX fragments_owner_list ON app.fragments(owner_id,created_at DESC,id) WHERE archived_at IS NULL;
GRANT SELECT,INSERT ON app.fragments TO slidebi_runtime;
GRANT UPDATE(archived_at) ON app.fragments TO slidebi_runtime;
