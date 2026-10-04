import {test,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import {createApp} from '../src/app';
import {fixture} from '../src/db';
test('explicit related result sets keep a stable dataset across listing, edit and Mock refresh',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
  const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'related tables') RETURNING id",[randomUUID()])).rows[0].id);
  const app=await createApp({pool,actorId:actor,workerEnabled:false});const data=await fixture();
  const manual=await request(app).post('/api/datasets').send({name:'关联多表',dataSpec:data,preserveResultSets:true});expect(manual.status).toBe(201);
  let list=await request(app).get('/api/datasets');expect(list.status).toBe(200);expect(list.body.items.map((d:any)=>d.id)).toContain(manual.body.id);
  expect(manual.body.scopeResultSetIds).toEqual(data.resultSets.map((r:any)=>r.id));
  const edited=await request(app).put(`/api/datasets/${manual.body.id}`).set('If-Match','1').send({name:'同一数据新版',dataSpec:manual.body.dataSpec});expect(edited.status).toBe(200);expect(edited.body.version).toBe(2);
  const bi=await request(app).post('/api/datasets/bi-import').send({chartId:'chart-demo-budget',preserveResultSets:true});expect(bi.status).toBe(201);
  list=await request(app).get('/api/datasets');expect(list.body.items.map((d:any)=>d.id)).toContain(bi.body.id);
  const reduced=structuredClone(bi.body.dataSpec);reduced.resultSets=reduced.resultSets.slice(0,2);
  const config={...bi.body.refreshConfig,queries:bi.body.refreshConfig.queries.filter((q:any)=>reduced.resultSets.some((rs:any)=>rs.id===q.resultSetId))};
  const changed=await request(app).put(`/api/datasets/${bi.body.id}`).set('If-Match','1').send({name:bi.body.name,dataSpec:reduced,refreshConfig:config});expect(changed.status,JSON.stringify(changed.body)).toBe(200);
  const refreshed=await request(app).post(`/api/datasets/${bi.body.id}/refresh`).set('If-Match','2').send({force:true});expect(refreshed.status,JSON.stringify(refreshed.body)).toBe(200);expect(refreshed.body.dataSpec.resultSets.map((r:any)=>r.id)).toEqual(reduced.resultSets.map((r:any)=>r.id));
  const invalid=await request(app).post('/api/datasets').send({name:'invalid',dataSpec:data,preserveResultSets:'yes'});expect(invalid.status).toBe(422);
  const conflict=await request(app).post('/api/datasets/bi-import').send({chartId:'chart-demo-budget',preserveResultSets:true,splitInputs:true});expect(conflict.status).toBe(422);
 }finally{await pool.end()}
});
