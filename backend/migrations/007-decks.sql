CREATE TABLE app.decks (
 id text PRIMARY KEY,
 owner_id bigint NOT NULL REFERENCES app.users(id),
 current_revision integer NOT NULL CHECK(current_revision>0),
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_id)
);
CREATE TABLE app.deck_revisions (
 deck_id text NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 owner_id bigint NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),
 spec jsonb NOT NULL CHECK(jsonb_typeof(spec)='object' AND spec ?& ARRAY['sections','instances','structurePolicy','numbering']),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(deck_id,revision),
 UNIQUE(deck_id,revision,owner_id),
 FOREIGN KEY(deck_id,owner_id) REFERENCES app.decks(id,owner_id)
);
ALTER TABLE app.decks ADD CONSTRAINT decks_current_revision_fk FOREIGN KEY(id,current_revision) REFERENCES app.deck_revisions(deck_id,revision) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE app.deck_slide_refs (
 deck_id text NOT NULL,
 deck_revision integer NOT NULL,
 owner_id bigint NOT NULL,
 instance_id text NOT NULL,
 slide_id text NOT NULL,
 slide_revision integer NOT NULL,
 PRIMARY KEY(deck_id,deck_revision,instance_id),
 FOREIGN KEY(deck_id,deck_revision,owner_id) REFERENCES app.deck_revisions(deck_id,revision,owner_id),
 FOREIGN KEY(slide_id,owner_id) REFERENCES app.slides(id,owner_id),
 FOREIGN KEY(slide_id,slide_revision) REFERENCES app.slide_revisions(slide_id,revision)
);
CREATE TABLE app.deck_previews (
 id text PRIMARY KEY,
 deck_id text NOT NULL,
 deck_revision integer NOT NULL,
 owner_id bigint NOT NULL,
 delivery_mode text NOT NULL CHECK(delivery_mode IN('draft','final')),
 export_spec jsonb NOT NULL CHECK(jsonb_typeof(export_spec)='object' AND jsonb_typeof(export_spec->'slides')='array' AND jsonb_array_length(export_spec->'slides') BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,deck_id,deck_revision,owner_id),
 FOREIGN KEY(deck_id,deck_revision,owner_id) REFERENCES app.deck_revisions(deck_id,revision,owner_id)
);
ALTER TABLE app.export_jobs ALTER COLUMN slide_id DROP NOT NULL, ALTER COLUMN slide_revision DROP NOT NULL;
ALTER TABLE app.export_jobs ADD COLUMN deck_id text, ADD COLUMN deck_revision integer, ADD COLUMN preview_id text;
ALTER TABLE app.export_jobs ADD CONSTRAINT jobs_deck_preview_fk FOREIGN KEY(preview_id,deck_id,deck_revision,owner_id) REFERENCES app.deck_previews(id,deck_id,deck_revision,owner_id);
ALTER TABLE app.export_jobs ADD CONSTRAINT jobs_input_kind CHECK (
 (slide_id IS NOT NULL AND slide_revision IS NOT NULL AND deck_id IS NULL AND deck_revision IS NULL AND preview_id IS NULL) OR
 (slide_id IS NULL AND slide_revision IS NULL AND deck_id IS NOT NULL AND deck_revision IS NOT NULL AND preview_id IS NOT NULL)
);
DO $$ DECLARE n text; BEGIN
 FOR n IN SELECT conname FROM pg_constraint WHERE conrelid='app.export_jobs'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%export_spec%' LOOP
  EXECUTE format('ALTER TABLE app.export_jobs DROP CONSTRAINT %I',n);
 END LOOP;
END $$;
ALTER TABLE app.export_jobs ADD CONSTRAINT jobs_export_spec CHECK (
 jsonb_typeof(export_spec)='object' AND
 export_spec ?& ARRAY['exportSpecVersion','provenance','canvas','theme','assets','slides','navigation','diagnostics'] AND
 NOT(export_spec ?| ARRAY['jobId','inputHash','deliveryMode']) AND
 jsonb_typeof(export_spec->'slides')='array' AND
 ((slide_id IS NOT NULL AND jsonb_array_length(export_spec->'slides')=1) OR (deck_id IS NOT NULL AND jsonb_array_length(export_spec->'slides') BETWEEN 1 AND 100))
);
CREATE INDEX decks_owner_list ON app.decks(owner_id,updated_at DESC,id) WHERE archived_at IS NULL;
CREATE INDEX deck_refs_slide ON app.deck_slide_refs(slide_id,slide_revision);
CREATE INDEX deck_previews_owner ON app.deck_previews(owner_id,created_at DESC);
CREATE INDEX jobs_deck_revision ON app.export_jobs(deck_id,deck_revision);
CREATE TRIGGER immutable_update BEFORE UPDATE ON app.deck_revisions FOR EACH ROW EXECUTE FUNCTION app.reject_update();
CREATE TRIGGER immutable_update BEFORE UPDATE ON app.deck_slide_refs FOR EACH ROW EXECUTE FUNCTION app.reject_update();
CREATE TRIGGER immutable_update BEFORE UPDATE ON app.deck_previews FOR EACH ROW EXECUTE FUNCTION app.reject_update();
GRANT SELECT,INSERT ON app.decks,app.deck_revisions,app.deck_slide_refs,app.deck_previews TO slidebi_runtime;
GRANT UPDATE(current_revision,updated_at,archived_at) ON app.decks TO slidebi_runtime;
