import {test,expect} from 'vitest';
import express from 'express';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import {registerCatalogRoutes} from '../src/catalog';
import {seed,fixture} from '../src/db';
import {createApp} from '../src/app';

test('template preview owns a stable example without creating managed data or business slides',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
  await seed(pool);const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'catalog') RETURNING id",[randomUUID()])).rows[0].id);
  const app=express();app.use(express.json());await registerCatalogRoutes(app,pool,actor);
  app.use((e:any,_q:any,r:any,_n:any)=>r.status(e.status||500).json({code:e.code,message:e.message}));
  const samples=await request(app).get('/api/samples');expect(samples.status).toBe(200);expect(samples.body.items).toEqual([]);
  const before=await pool.query('SELECT count(*) FROM app.slides WHERE owner_id=$1',[actor]);
  const preview=await request(app).post('/api/templates/budget-comparison/preview').send({});
  expect(preview.status).toBe(200);expect(preview.body.compiled.elements.some((e:any)=>e.text?.includes('100万元'))).toBe(true);expect(preview.body.sample).toBeUndefined();expect(preview.body.dataSpec.snapshot.id).toMatch(/^template-example-/);expect(preview.body.example.businessContext.background).toContain('预算');expect(preview.body.example.businessContext.background).not.toContain('随时间');expect(preview.body.example.businessContext.scenarios.length).toBeGreaterThan(0);
  expect(preview.body.dataSpec.resultSets.map((r:any)=>r.id)).toEqual(['budget']);
  expect(preview.body.example.dataSpec.resultSets.map((r:any)=>r.id)).toEqual(['budget']);
  expect(preview.body.dataSpec.measures.some((m:any)=>m.id==='bridge-value')).toBe(false);
  expect((await pool.query('SELECT count(*) FROM app.slides WHERE owner_id=$1',[actor])).rows).toEqual(before.rows);
  const sample=await request(app).post('/api/samples').send({name:'销售样本',tags:['销售','演示数据'],templateIds:['budget-comparison'],dataSpec:await fixture()});
  expect(sample.status).toBe(201);
  const saved=await request(app).put(`/api/samples/${sample.body.id}`).set('If-Match','1').send({...sample.body,name:'销售样本修订'});
  expect(saved.status).toBe(200);expect(saved.body.version).toBe(2);
  expect((await request(app).put(`/api/samples/${sample.body.id}`).set('If-Match','1').send(sample.body)).status).toBe(409);
  const again=await request(app).post('/api/templates/budget-comparison/preview').send({});
  expect(again.body.example).toEqual(preview.body.example);
 }finally{await pool.end()}
});

test('dataset matching and preview use the current version and protect private samples',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
  const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'catalog-current') RETURNING id",[randomUUID()])).rows[0].id);
  const other=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'catalog-other') RETURNING id",[randomUUID()])).rows[0].id);
  const app=await createApp({pool,actorId:actor,workerEnabled:false});
  const privateApp=await createApp({pool,actorId:other,workerEnabled:false});
  const created=await request(app).post('/api/datasets').send({name:'预算数据',dataSpec:await fixture()});
  expect(created.status).toBe(201);
  const d=created.body;
  const matches=await request(app).get(`/api/datasets/${d.id}/templates`);
  expect(matches.status).toBe(200);
  expect(matches.body.items.filter((x:any)=>x.status==='matched').map((x:any)=>x.templateId)).toEqual(expect.arrayContaining(['budget-comparison','monthly-trend','revenue-bridge']));
  d.dataSpec.resultSets[0].rows[0].actual='14000000';
  const updated=await request(app).put(`/api/datasets/${d.id}`).set('If-Match','1').send({name:d.name,dataSpec:d.dataSpec});
  expect(updated.status).toBe(200);
  const preview=await request(app).post('/api/templates/budget-comparison/preview').send({datasetId:d.id});
  expect(preview.status).toBe(200);expect(preview.body.slide.snapshotRef).toBe(updated.body.currentSnapshotId);
  expect(preview.body.compiled.elements.some((e:any)=>e.text?.includes('300万元'))).toBe(true);
  const sample=await request(privateApp).post('/api/samples').send({name:'私有样本',tags:['私有'],templateIds:['budget-comparison'],dataSpec:await fixture()});
  expect(sample.status).toBe(201);
  expect((await request(app).get(`/api/samples/${sample.body.id}`)).status).toBe(404);
  expect((await request(app).post('/api/templates/budget-comparison/preview').send({sampleId:sample.body.id})).status).toBe(404);
  expect((await request(privateApp).get(`/api/datasets/${d.id}/templates`)).status).toBe(404);
  expect((await request(privateApp).post('/api/templates/budget-comparison/preview').send({datasetId:d.id})).status).toBe(404);
 }finally{await pool.end()}
});

test('data-format matches return usable bindings and prioritize explicitly associated templates',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
  const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'format-match') RETURNING id",[randomUUID()])).rows[0].id);
  const app=await createApp({pool,actorId:actor,workerEnabled:false});
  const data=await fixture();data.chartHints=[];data.resultSets=data.resultSets.filter((r:any)=>r.id==='trend');
  const made=await request(app).post('/api/datasets').send({name:'格式匹配',dataSpec:data,templateIds:['region-donut']});expect(made.status).toBe(201);
  const matches=await request(app).get(`/api/datasets/${made.body.id}/templates`);
  expect(matches.body.items[0].templateId).toBe('region-donut');expect(matches.body.items[0].matchedBy).toBe('schema');
  for(const t of matches.body.items.filter((t:any)=>t.status==='matched')){
   const p=await request(app).post(`/api/templates/${t.templateId}/preview`).send({datasetId:made.body.id,bindings:t.bindings});
   expect(p.status).toBe(200);expect(p.body.compatible).toBe(true);
  }
  const p=await request(app).post('/api/templates/region-donut/preview').send({datasetId:made.body.id});expect(p.body.compatible).toBe(true);
 }finally{await pool.end();}
});
