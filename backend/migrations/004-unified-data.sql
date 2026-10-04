ALTER TABLE app.datasets ADD COLUMN tags jsonb NOT NULL DEFAULT '{"用途":["页面数据"]}' CHECK(jsonb_typeof(tags)='object');
ALTER TABLE app.datasets ADD COLUMN template_ids text[] NOT NULL DEFAULT '{}';
ALTER TABLE app.datasets ADD COLUMN legacy_sample_id text;
CREATE UNIQUE INDEX datasets_legacy_sample ON app.datasets(owner_id,legacy_sample_id) WHERE legacy_sample_id IS NOT NULL;
ALTER TABLE app.dataset_versions ADD COLUMN tags jsonb NOT NULL DEFAULT '{"用途":["页面数据"]}' CHECK(jsonb_typeof(tags)='object');
ALTER TABLE app.dataset_versions ADD COLUMN template_ids text[] NOT NULL DEFAULT '{}';
-- Existing custom sample content is copied once; the original table remains evidence.
INSERT INTO app.data_snapshots(id,owner_id,data_spec_id,spec_version,content_hash,captured_at,data_as_of,consistency,payload)
 SELECT 'snapshot-sample-'||md5(id),owner_id,data_spec->>'id',data_spec->>'specVersion',encode(sha256(convert_to(data_spec::text,'UTF8')),'hex'),
 COALESCE((data_spec->'snapshot'->>'capturedAt')::timestamptz,created_at),(data_spec->'snapshot'->>'dataAsOf')::timestamptz,
 CASE WHEN data_spec->'snapshot'->>'consistency'='fixture' THEN 'fixture' ELSE 'importedSnapshot' END,data_spec-ARRAY['id','specVersion','snapshot']
 FROM app.samples WHERE NOT builtin;
INSERT INTO app.datasets(id,owner_id,name,version,current_snapshot_id,origin,updated_at,tags,template_ids,legacy_sample_id)
 SELECT 'dataset-sample-'||md5(id),owner_id,name,version,'snapshot-sample-'||md5(id),jsonb_build_object('kind','manual','importedAt',created_at,'legacySampleId',id),updated_at,
 jsonb_build_object('用途',jsonb_build_array('模板样本'),'原样本标签',to_jsonb(tags)),template_ids,id FROM app.samples WHERE NOT builtin;
INSERT INTO app.dataset_versions(dataset_id,version,name,snapshot_id,operation,created_at,tags,template_ids)
 SELECT id,version,name,current_snapshot_id,'import',updated_at,tags,template_ids FROM app.datasets WHERE legacy_sample_id IS NOT NULL;
-- Application compatibility routes now write datasets only.
REVOKE INSERT,UPDATE ON app.samples FROM slidebi_runtime;
REVOKE UPDATE(name,tags,template_ids,version,data_spec,updated_at) ON app.samples FROM slidebi_runtime;
GRANT UPDATE(tags,template_ids,legacy_sample_id) ON app.datasets TO slidebi_runtime;
