ALTER TABLE app.decks ADD COLUMN native_content boolean NOT NULL DEFAULT false;
ALTER TABLE app.slides ADD COLUMN content_deck_id text;
ALTER TABLE app.slides ADD CONSTRAINT slide_content_owner_fk FOREIGN KEY(content_deck_id,owner_id) REFERENCES app.decks(id,owner_id);
CREATE INDEX slides_content ON app.slides(content_deck_id) WHERE content_deck_id IS NOT NULL;
GRANT UPDATE(native_content) ON app.decks TO slidebi_runtime;
GRANT UPDATE(content_deck_id) ON app.slides TO slidebi_runtime;
CREATE TABLE app.content_imports (
 owner_id bigint NOT NULL REFERENCES app.users(id),
 idempotency_key text NOT NULL,
 input_hash text NOT NULL,
 content_id text NOT NULL,
 response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,idempotency_key),
 FOREIGN KEY(content_id,owner_id) REFERENCES app.decks(id,owner_id)
);
GRANT SELECT,INSERT ON app.content_imports TO slidebi_runtime;
CREATE TRIGGER immutable_update BEFORE UPDATE ON app.content_imports FOR EACH ROW EXECUTE FUNCTION app.reject_update();
