import {test,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import {createApp} from '../src/app';
import {fixture} from '../src/db';
test('unified editable samples, extensible tags, current template preview and versioned rollback',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'unified') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,workerEnabled:false});
 const first=await request(app).get('/api/datasets');expect(first.status).toBe(200);expect(first.body.items.filter((d:any)=>Number(d.ownerId)===actor)).toHaveLength(0);const example=(await request(app).post('/api/templates/budget-comparison/preview').send({})).body;const sample=(await request(app).post('/api/datasets').send({name:'自有预算数据',dataSpec:example.dataSpec,templateIds:['budget-comparison']})).body;expect(sample.id).toBeDefined();
 const data=structuredClone(sample.dataSpec);data.resultSets[0].rows[0].actual='14000000';data.semanticSchema.tables[0].name='区域新名称';data.semanticSchema.tables[0].columns[0].name='区域代码新名称';
 const update=await request(app).put(`/api/datasets/${sample.id}`).set('If-Match',String(sample.version)).send({name:'可改样本',dataSpec:data,tags:{用途:['模板样本','页面数据','页面数据'],自定义:[' 新值 ','新值']},templateIds:['budget-comparison']});expect(update.status).toBe(200);expect(update.body.tags).toEqual({用途:['模板样本','页面数据'],自定义:['新值']});
 const stable=await request(app).post('/api/templates/budget-comparison/preview').send({});expect(stable.body.example).toEqual(example.example);const preview=await request(app).post('/api/templates/budget-comparison/preview').send({datasetId:sample.id});expect(preview.status).toBe(200);expect(preview.body.slide.snapshotRef).toBe(update.body.currentSnapshotId);expect(preview.body.dataSpec.semanticSchema.tables[0].name).toBe('区域新名称');
 const page=await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:sample.id,templateId:'budget-comparison'});expect(page.status).toBe(201);
 const strip=await request(app).put(`/api/datasets/${sample.id}`).set('If-Match',String(update.body.version)).send({name:'无用途',dataSpec:update.body.dataSpec,tags:{自定义:['其他']},templateIds:[]});expect(strip.status).toBe(200);expect((await request(app).get(`/api/slides/${page.body.id}`)).body.snapshotRef).toBe(strip.body.currentSnapshotId);
 const roll=await request(app).post(`/api/datasets/${sample.id}/rollback`).set('If-Match',String(strip.body.version)).send({version:update.body.version});expect(roll.status).toBe(200);expect(roll.body.tags).toEqual(update.body.tags);expect(roll.body.templateIds).toEqual(update.body.templateIds);expect(roll.body.name).toBe('可改样本');
 const app2=await createApp({pool,actorId:actor,workerEnabled:false});expect((await request(app2).get('/api/datasets')).body.items.filter((d:any)=>Number(d.ownerId)===actor)).toHaveLength(1);
 const normal=await request(app).post('/api/datasets').send({name:'默认页面',dataSpec:await fixture()});expect(normal.body.tags).toEqual({用途:['页面数据']});
 const retained=await request(app).put(`/api/datasets/${sample.id}`).set('If-Match',String(roll.body.version)).send({name:'仅名称',dataSpec:roll.body.dataSpec});expect(retained.body.tags).toEqual(update.body.tags);expect(retained.body.templateIds).toEqual(update.body.templateIds);
 }finally{await pool.end()}
});
test('unified tags validate limits and template ownership while legacy samples only project datasets',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=async()=>Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'unified isolation') RETURNING id",[randomUUID()])).rows[0].id);
 const one=await actor(),two=await actor();const app=await createApp({pool,actorId:one,workerEnabled:false}),other=await createApp({pool,actorId:two,workerEnabled:false});
 const base={name:'标签',dataSpec:await fixture()};
 for(const tags of [[],{['x'.repeat(31)]:['a']},{用途:Array.from({length:13},(_,i)=>String(i))},{用途:['x'.repeat(51)]},{用途:['  ']},Object.fromEntries(Array.from({length:13},(_,i)=>['type'+i,['a']]))])expect((await request(app).post('/api/datasets').send({...base,tags})).status).toBe(422);
 const before=(await pool.query('SELECT count(*) FROM app.samples')).rows;
 const legacy=await request(app).post('/api/samples').send({...base,tags:['行业'],templateIds:['monthly-trend']});expect(legacy.status).toBe(201);
 const unified=await request(app).get(`/api/datasets/${legacy.body.id}`);expect(unified.status).toBe(200);expect(unified.body.tags).toEqual({用途:['模板样本'],原样本标签:['行业']});
 expect((await pool.query('SELECT count(*) FROM app.samples')).rows).toEqual(before);
 expect((await request(other).get(`/api/samples/${legacy.body.id}`)).status).toBe(404);
 const listed=await request(app).get('/api/datasets');expect(listed.status,JSON.stringify(listed.body)).toBe(200);const seeds=listed.body.items.filter((d:any)=>d.tags.样本标签);const otherSeeds=(await request(other).get('/api/datasets')).body.items;expect(seeds.every((d:any)=>!otherSeeds.some((x:any)=>x.id===d.id))).toBe(true);
 const owned=(await request(other).post('/api/datasets').send({name:'独立数据',dataSpec:await fixture()})).body;const page=(await request(other).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:owned.id,templateId:'budget-comparison'})).body;
 const privateTemplate=(await request(other).post('/api/templates').send({slideId:page.id,name:'私有模板'})).body;
 expect((await request(app).post('/api/datasets').send({...base,templateIds:[privateTemplate.id]})).status).toBe(404);
 }finally{await pool.end()}
});
test('migration retained original custom sample rows and copied ownership, current version and tags',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const old=(await pool.query('SELECT * FROM app.samples WHERE NOT builtin ORDER BY created_at LIMIT 1')).rows[0];
 if(!old)return; // Fresh isolated databases have no pre-migration custom samples.
 const d=(await pool.query('SELECT * FROM app.datasets WHERE owner_id=$1 AND legacy_sample_id=$2',[old.owner_id,old.id])).rows[0];expect(d).toBeDefined();expect(d.name).toBe(old.name);expect(d.version).toBe(old.version);expect(d.tags).toEqual({用途:['模板样本'],原样本标签:old.tags});expect(d.template_ids).toEqual(old.template_ids);
 const v=(await pool.query('SELECT * FROM app.dataset_versions WHERE dataset_id=$1 AND version=$2',[d.id,d.version])).rows[0];expect(v.tags).toEqual(d.tags);expect(v.template_ids).toEqual(d.template_ids);
 expect((await pool.query("SELECT has_table_privilege(current_user,'app.samples','INSERT') AS insert,has_column_privilege(current_user,'app.samples','name','UPDATE') AS update")).rows[0]).toEqual({insert:false,update:false});
 }finally{await pool.end()}
});
test('BI sync preserves dataset purpose and template links while rollback restores original metadata',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'unified BI') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,workerEnabled:false});
 const imported=await request(app).post('/api/datasets/bi-import').send({chartId:'chart-demo-budget',tags:{用途:['模板样本','页面数据'],团队:['销售']},templateIds:['budget-comparison']});expect(imported.status).toBe(201);const d=imported.body;expect(d.tags.团队).toEqual(['销售']);
 const edit=await request(app).put(`/api/datasets/${d.id}`).set('If-Match','1').send({name:'BI双用途',dataSpec:d.dataSpec,tags:{用途:['页面数据']},templateIds:[]});expect(edit.status).toBe(200);
 const refresh=await request(app).post(`/api/datasets/${d.id}/refresh`).set('If-Match','2').send({force:true});expect(refresh.status).toBe(200);expect(refresh.body.tags).toEqual({用途:['页面数据']});expect(refresh.body.templateIds).toEqual([]);
 const rollback=await request(app).post(`/api/datasets/${d.id}/rollback`).set('If-Match','3').send({version:1});expect(rollback.status).toBe(200);expect(rollback.body.tags).toEqual(d.tags);expect(rollback.body.templateIds).toEqual(d.templateIds);expect(rollback.body.origin).toEqual(d.origin);
 }finally{await pool.end()}
});
