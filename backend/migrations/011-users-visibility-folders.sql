ALTER TABLE app.users ADD COLUMN username text UNIQUE, ADD COLUMN password_hash text, ADD COLUMN role text NOT NULL DEFAULT 'user' CHECK(role IN('admin','user'));
UPDATE app.users SET username='marx',display_name='marx',role='admin' WHERE identity_provider='local' AND external_subject='developer';
INSERT INTO app.users(identity_provider,external_subject,display_name,username,password_hash,role) VALUES('local','marx','marx','marx','scrypt:7612aea0bc42167574e7faffca26bbd8:77e20fadb57c0d304239ef1ea4ed6f17d44b1d647d3eb3e7fe8d7b839cd513a10626a28a4dca3d4e93c89a784ca51a4487943f55418febb122fab61cddfe1ea8','admin') ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role;
INSERT INTO app.users(identity_provider,external_subject,display_name,username,password_hash,role) VALUES('local','summer','summer','summer','scrypt:292b19c21552581d4559ac7c202c0d4b:9cb2a3c6dcc65b3a3ff09278f2a8e46f14d93993d8e73749a67f2c2d28696f9d6727d90b6095b1297efa577f41396369c011eda476cc491eeae8f70f5a1e0d13','user') ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role;
INSERT INTO app.users(identity_provider,external_subject,display_name,username,password_hash,role) VALUES('local','mary','mary','mary','scrypt:dc64ae0f908b52001edb967def856854:05515400daba3d4ba31dd3f93715e85d016fbc41b1621c7977945855d41ceadee6a72d19bd928b6cf81ecf40225f275a525d22ce9489e1c8d9c69f10e1a0f3cf','user') ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role;

CREATE TABLE app.sessions(token_hash text PRIMARY KEY CHECK(length(token_hash)=64),user_id bigint NOT NULL REFERENCES app.users(id),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX sessions_expiry ON app.sessions(expires_at);
CREATE INDEX sessions_user ON app.sessions(user_id);
-- Remove the legacy builtin ownership check before assigning the administrator.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT conrelid::regclass AS tbl,conname FROM pg_constraint WHERE conrelid IN('app.assets'::regclass,'app.templates'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%visibility%' LOOP
 EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname); END LOOP;
END $$;
UPDATE app.templates SET owner_id=(SELECT id FROM app.users WHERE username='marx'),visibility=CASE WHEN visibility='builtin' THEN 'public' ELSE visibility END WHERE owner_id IS NULL;
UPDATE app.assets SET owner_id=(SELECT id FROM app.users WHERE username='marx'),visibility=CASE WHEN visibility='builtin' THEN 'public' ELSE visibility END WHERE owner_id IS NULL;
ALTER TABLE app.templates ALTER COLUMN owner_id SET NOT NULL, ADD CONSTRAINT templates_visibility_check CHECK(visibility IN('private','public'));
ALTER TABLE app.assets ALTER COLUMN owner_id SET NOT NULL, ADD CONSTRAINT assets_visibility_check CHECK(visibility IN('private','public'));
-- Reassign legacy local users, retaining synthetic test identities and owner-scoped keys.
-- Most installations retain the original developer id, so no document rewrite is needed.
DO $$ DECLARE r record; target bigint; BEGIN
 SELECT id INTO target FROM app.users WHERE username='marx';
 FOR r IN SELECT conrelid::regclass AS tbl,conname FROM pg_constraint WHERE contype='f' AND connamespace='app'::regnamespace LOOP
 EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED',r.tbl,r.conname); END LOOP;
 SET CONSTRAINTS ALL DEFERRED;
 FOR r IN SELECT table_name FROM information_schema.columns WHERE table_schema='app' AND column_name='owner_id' AND table_name NOT IN('samples','template_favorites','asset_favorites') LOOP
 EXECUTE format('ALTER TABLE app.%I DISABLE TRIGGER USER',r.table_name);
 EXECUTE format('UPDATE app.%I SET owner_id=$1 WHERE owner_id IN(SELECT id FROM app.users WHERE identity_provider=''local'' AND username IS NULL)',r.table_name) USING target;
 EXECUTE format('ALTER TABLE app.%I ENABLE TRIGGER USER',r.table_name);
 END LOOP;
END $$;
ALTER TABLE app.decks ADD COLUMN visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN('private','public'));
ALTER TABLE app.datasets ADD COLUMN visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN('private','public'));
CREATE TABLE app.folders(id text PRIMARY KEY,kind text NOT NULL CHECK(kind IN('data','assets')),owner_id bigint NOT NULL REFERENCES app.users(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),parent_id text REFERENCES app.folders(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(parent_id IS DISTINCT FROM id));
CREATE INDEX folders_owner_parent ON app.folders(owner_id,kind,parent_id);
ALTER TABLE app.datasets ADD COLUMN folder_id text REFERENCES app.folders(id);
ALTER TABLE app.assets ADD COLUMN folder_id text REFERENCES app.folders(id);
CREATE INDEX datasets_folder ON app.datasets(folder_id);
CREATE INDEX assets_folder ON app.assets(folder_id);
-- A public document can have a preview/export requested by someone other than its author.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='app.deck_previews'::regclass AND confrelid='app.deck_revisions'::regclass AND contype='f' LOOP
 EXECUTE format('ALTER TABLE app.deck_previews DROP CONSTRAINT %I',r.conname); END LOOP;
END $$;
ALTER TABLE app.deck_previews ADD CONSTRAINT deck_previews_source_fk FOREIGN KEY(deck_id,deck_revision) REFERENCES app.deck_revisions(deck_id,revision);
GRANT SELECT,INSERT,DELETE ON app.sessions TO slidebi_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.folders TO slidebi_runtime;
GRANT UPDATE(username,password_hash,role) ON app.users TO slidebi_runtime;
GRANT UPDATE(visibility) ON app.decks TO slidebi_runtime;
GRANT UPDATE(visibility,folder_id) ON app.assets TO slidebi_runtime;
GRANT UPDATE(visibility) ON app.templates TO slidebi_runtime;
