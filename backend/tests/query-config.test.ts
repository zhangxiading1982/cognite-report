import {test,expect} from 'vitest';
import request from 'supertest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app';
import {fixture} from '../src/db';
test('named query configuration versions and rollback, atomic mock refresh and grouped input',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'query-config') RETURNING id",[randomUUID()])).rows[0].id);const app=await createApp({pool,actorId:actor,workerEnabled:false});
 const dataSpec=await fixture(),refreshConfig={mode:'biStudioMock',queries:dataSpec.resultSets.map((rs:any,i:number)=>({id:'query-'+i,name:'查询'+i,language:'dax',text:'EVALUATE mock',modelId:'operations-demo',resultSetId:rs.id,chartGroup:'cross-table',role:i?'rowSubtotal':'detail'}))};
 const created=await request(app).post('/api/datasets/split-import').send({name:'多查询图表',dataSpec,refreshConfig});expect(created.status).toBe(201);expect(created.body.items).toHaveLength(1);let d=created.body.items[0];expect(d.refreshConfig).toEqual(refreshConfig);
 const copied=await request(app).post(`/api/datasets/${d.id}/copy`).set('If-Match','1').send({name:'查询副本'});expect(copied.body.refreshConfig).toEqual(refreshConfig);
 const slide=(await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:d.id,templateId:'budget-comparison'})).body;expect(slide.extensions.dataset.refreshMode).toBe('biStudioMock');
 const edited=await request(app).put(`/api/datasets/${d.id}/refresh-config`).set('If-Match','1').send({refreshConfig:{...refreshConfig,queries:refreshConfig.queries.map((q:any)=>({...q,text:'EVALUATE changed'}))}});expect(edited.status).toBe(200);expect(edited.body.id).toBe(d.id);expect(edited.body.version).toBe(2);
 const roll=await request(app).post(`/api/datasets/${d.id}/rollback`).set('If-Match','2').send({version:1});expect(roll.body.refreshConfig).toEqual(refreshConfig);
 const fresh=await request(app).post(`/api/datasets/${d.id}/refresh`).set('If-Match','3').send({force:true});expect(fresh.status).toBe(200);expect(fresh.body.version).toBe(4);expect(fresh.body.dataSpec.resultSets).toHaveLength(3);
 const invalid={...refreshConfig,queries:refreshConfig.queries.map((q:any,i:number)=>({...q,modelId:i?'missing-model':'operations-demo'}))};expect((await request(app).put(`/api/datasets/${d.id}/refresh-config`).set('If-Match','4').send({refreshConfig:invalid})).status).toBe(200);
 expect((await request(app).post(`/api/datasets/${d.id}/refresh`).set('If-Match','5').send({force:true})).status).toBe(422);expect((await request(app).get(`/api/datasets/${d.id}`)).body.version).toBe(5);
 const sql={...refreshConfig,queries:refreshConfig.queries.map((q:any)=>({...q,language:'sql',text:'select 1'}))};await request(app).put(`/api/datasets/${d.id}/refresh-config`).set('If-Match','5').send({refreshConfig:sql});expect((await request(app).post(`/api/datasets/${d.id}/refresh`).set('If-Match','6').send({force:true})).status).toBe(501);
 }finally{await pool.end()}
});
test('latest document preview refreshes manual-origin configured queries, explicit manual mode disables refresh',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'query-export') RETURNING id",[randomUUID()])).rows[0].id),app=await createApp({pool,actorId:actor,workerEnabled:false}),dataSpec=await fixture();
 const config={mode:'biStudioMock',chartId:'chart-demo-bridge',queries:dataSpec.resultSets.map((rs:any)=>({id:rs.id,name:rs.id,language:'dax',text:'EVALUATE example',modelId:'operations-demo',resultSetId:rs.id,chartGroup:'main'}))};
 await request(app).post('/api/mock-bi/charts/chart-demo-bridge/advance').send({scenario:'recover'});
 const d=(await request(app).post('/api/datasets').send({name:'查询刷新',dataSpec,refreshConfig:config})).body;
 const p=(await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:d.id,templateId:'budget-comparison'})).body;
 const c=(await request(app).post('/api/contents').send({title:'查询导出'})).body;
 const attached=(await request(app).post(`/api/contents/${c.id}/pages`).send({revision:c.revision,slideId:p.id})).body;
 const preview=await request(app).post(`/api/decks/${c.id}/preview`).send({revision:attached.revision,deliveryMode:'draft',dataPolicy:'latestRequired'});expect(preview.status).toBe(200);expect((await request(app).get(`/api/datasets/${d.id}`)).body.version).toBe(2);
 const manual=await request(app).put(`/api/datasets/${d.id}/refresh-config`).set('If-Match','2').send({refreshConfig:{...config,mode:'manual'}});expect(manual.status).toBe(200);
 await request(app).post('/api/mock-bi/charts/chart-demo-bridge/advance').send({scenario:'fail'});
 const disabled=await request(app).post(`/api/decks/${c.id}/preview`).send({revision:attached.revision,deliveryMode:'draft',dataPolicy:'latestRequired'});expect(disabled.status).toBe(200);expect((await request(app).get(`/api/datasets/${d.id}`)).body.version).toBe(3);
 await request(app).post('/api/mock-bi/charts/chart-demo-bridge/advance').send({scenario:'recover'});
 }finally{await pool.end()}
});
test('separate chart groups split independently while subtotal queries stay with their chart',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'query-groups') RETURNING id",[randomUUID()])).rows[0].id),app=await createApp({pool,actorId:actor,workerEnabled:false}),dataSpec=await fixture();
 const refreshConfig={mode:'biStudioMock',queries:dataSpec.resultSets.map((rs:any,i:number)=>({id:rs.id,name:rs.id,language:'dax',text:'EVALUATE example',modelId:'operations-demo',resultSetId:rs.id,chartGroup:i===2?'second':'first',role:i===1?'rowSubtotal':'detail'}))};
 const result=await request(app).post('/api/datasets/split-import').send({name:'两个图表',dataSpec,refreshConfig});expect(result.status).toBe(201);expect(result.body.items).toHaveLength(2);
 const first=result.body.items.find((d:any)=>d.scopeResultSetIds.includes('budget'));expect(first.dataSpec.resultSets.map((r:any)=>r.id)).toEqual(['budget','trend']);expect(first.refreshConfig.queries).toHaveLength(2);
 const invalid={...first.refreshConfig,queries:first.refreshConfig.queries.map((q:any)=>({...q,name:'重复'}))};expect((await request(app).put(`/api/datasets/${first.id}/refresh-config`).set('If-Match','1').send({refreshConfig:invalid})).status).toBe(422);expect((await request(app).get(`/api/datasets/${first.id}`)).body.version).toBe(1);
 }finally{await pool.end()}
});
