import { beforeAll, afterAll, expect, test } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../src/app.ts';
import { fixture } from '../src/db.ts';

const pool = new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
let storageDir: string;
beforeAll(async()=>{storageDir=await mkdtemp(path.join(os.tmpdir(),'slidebi-fragments-test-'))});
afterAll(async()=>{await pool.end();await rm(storageDir,{recursive:true,force:true})});
async function context(){
  const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'fragments') RETURNING id",[randomUUID()])).rows[0].id);
  const app=await createApp({pool,actorId:actor,storageDir,workerEnabled:false});
  return {actor,app};
}
async function page(app:Awaited<ReturnType<typeof createApp>>){
  const data=await request(app).post('/api/datasets').send({name:'片段数据',dataSpec:await fixture()});
  expect(data.status).toBe(201);
  const slide=await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:data.body.id,templateId:'budget-comparison'});
  expect(slide.status).toBe(201);return slide.body;
}
test('personal fragments capture selected persisted revision with bindings, no snapshot copy, and archive without changing source',async()=>{
  const {actor,app}=await context();const slide=await page(app);
  const title=slide.elements.find((e:any)=>e.type==='text'),chart=slide.elements.find((e:any)=>e.type==='chart');
  slide.layoutOverrides[title.id]={rect:{x:44}};
  const saved=await request(app).put(`/api/slides/${slide.id}`).set('If-Match','1').send(slide);expect(saved.status).toBe(200);
  const before=Number((await pool.query('SELECT count(*) FROM app.data_snapshots WHERE owner_id=$1',[actor])).rows[0].count);
  const created=await request(app).post('/api/fragments').send({slideId:slide.id,revision:2,elementIds:[title.id,chart.id],name:' 收入卡片 ',tags:['经营','经营',' 月报 ']});
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({name:'收入卡片',tags:['经营','月报'],sourceSlideId:slide.id,sourceRevision:2});
  expect(created.body.spec.elements).toHaveLength(2);
  expect(created.body.spec.elements[0].rect.x).toBe(44);
  expect(created.body.spec.bindings.main).toEqual(slide.bindings.main);
  expect(Object.keys(created.body.spec).sort()).toEqual(['bindings','elements','themeRef']);
  expect(Number((await pool.query('SELECT count(*) FROM app.data_snapshots WHERE owner_id=$1',[actor])).rows[0].count)).toBe(before);
  const historical=await request(app).post('/api/fragments').send({slideId:slide.id,revision:1,elementIds:[title.id],name:'原始标题',tags:[]});
  expect(historical.status).toBe(201);expect(historical.body.spec.elements[0].rect.x).toBe(title.rect.x);
  const listed=await request(app).get('/api/fragments');expect(listed.status).toBe(200);expect(listed.body.items).toHaveLength(2);
  expect((await request(app).get(`/api/fragments/${created.body.id}`)).body.spec).toEqual(created.body.spec);
  expect((await request(app).post(`/api/fragments/${created.body.id}/archive`)).status).toBe(200);
  expect((await request(app).get('/api/fragments')).body.items.map((x:any)=>x.id)).toEqual([historical.body.id]);
  expect((await request(app).get(`/api/fragments/${created.body.id}`)).status).toBe(404);
  expect((await request(app).get(`/api/slides/${slide.id}`)).body).toEqual(saved.body);
});
test('private fragment routes reject other owners, forged source/spec, invalid selection and metadata',async()=>{
  const owner=await context(),other=await context(),slide=await page(owner.app);
  const body={slideId:slide.id,revision:1,elementIds:[slide.elements[0].id],name:'仅我可见',tags:[]};
  const made=await request(owner.app).post('/api/fragments').send(body);expect(made.status).toBe(201);
  expect((await request(other.app).post('/api/fragments').send(body)).status).toBe(404);
  expect((await request(other.app).get('/api/fragments')).body.items).toEqual([]);
  expect((await request(other.app).get(`/api/fragments/${made.body.id}`)).status).toBe(404);
  expect((await request(other.app).post(`/api/fragments/${made.body.id}/archive`)).status).toBe(404);
  for(const invalid of [
    {...body,spec:{elements:[]}}, {...body,origin:{teamId:'fake'}}, {...body,ownerId:other.actor},
    {...body,name:' '}, {...body,name:'x'.repeat(201)}, {...body,tags:Array(13).fill('x')},
    {...body,tags:['x'.repeat(51)]}, {...body,tags:[false]}, {...body,revision:0},
    {...body,elementIds:[]}, {...body,elementIds:['missing']}, {...body,elementIds:[body.elementIds[0],body.elementIds[0]]},
  ]) expect((await request(owner.app).post('/api/fragments').send(invalid)).status).toBe(422);
  expect((await request(owner.app).post('/api/fragments').send({...body,revision:99999})).status).toBe(404);
});
