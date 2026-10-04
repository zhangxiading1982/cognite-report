CREATE TABLE app.samples (
 id text PRIMARY KEY,
 owner_id bigint REFERENCES app.users(id),
 builtin boolean NOT NULL DEFAULT false,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 tags text[] NOT NULL DEFAULT '{}',
 template_ids text[] NOT NULL DEFAULT '{}',
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 data_spec jsonb NOT NULL CHECK(jsonb_typeof(data_spec)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((builtin AND owner_id IS NULL) OR (NOT builtin AND owner_id IS NOT NULL))
);
CREATE INDEX samples_owner ON app.samples(owner_id,updated_at DESC);
GRANT SELECT,INSERT ON app.samples TO slidebi_runtime;
GRANT UPDATE(name,tags,template_ids,version,data_spec,updated_at) ON app.samples TO slidebi_runtime;
