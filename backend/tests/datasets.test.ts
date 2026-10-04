import {test,expect} from 'vitest';
import request from 'supertest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app';
import {fixture} from '../src/db';
test('datasets publish versions, immutable origin, latest pages, six-version rollback and frozen exports',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'datasets') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,workerEnabled:false});
 const created=await request(app).post('/api/datasets').send({name:'收入',dataSpec:await fixture()});expect(created.status).toBe(201);
 let d=created.body;expect(d.origin.kind).toBe('manual');expect(d.dataId).toMatch(/^d_[0-9a-f]{32}$/);expect(d.owner.displayName).toBe('datasets');
 const page=await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:d.id,templateId:'budget-comparison'});expect(page.status).toBe(201);
 expect((await request(app).put(`/api/datasets/${d.id}`).set('If-Match','1').send({...d,origin:{kind:'biStudio'}})).status).toBe(422);
 for(let i=0;i<6;i++){const r=await request(app).put(`/api/datasets/${d.id}`).set('If-Match',String(d.version)).send({name:'收入'+i,dataSpec:d.dataSpec});expect(r.status).toBe(200);d=r.body;}
 const current=await request(app).get(`/api/slides/${page.body.id}`);expect(current.body.snapshotRef).toBe(d.currentSnapshotId);expect(current.body.elements).toEqual(page.body.elements);expect(current.body.revision).toBe(7);
 expect((await request(app).put(`/api/slides/${page.body.id}`).set('If-Match','1').send(page.body)).status).toBe(409);
 const history=await request(app).get(`/api/datasets/${d.id}/versions`);expect(history.body.items).toHaveLength(6);
 expect((await request(app).post(`/api/datasets/${d.id}/rollback`).set('If-Match','7').send({version:1})).status).toBe(422);
 const roll=await request(app).post(`/api/datasets/${d.id}/rollback`).set('If-Match','7').send({version:2});expect(roll.status).toBe(200);expect(roll.body.version).toBe(8);
 }finally{await pool.end()}
});
test('mock BI preserves edits for unchanged upstream, refreshes real changes, reports failures and freezes jobs',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'BI') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,workerEnabled:false});
 const create=await request(app).post('/api/datasets/bi-import').send({chartId:'chart-demo-budget'});expect(create.status).toBe(201);let d=create.body;expect(d.origin.transport).toBe('mock');
 const page=await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:d.id,templateId:'budget-comparison'});expect(page.status).toBe(201);
 const job=await request(app).post('/api/export-jobs').set('Idempotency-Key',randomUUID()).send({slideId:page.body.id,revision:1,deliveryMode:'draft'});expect(job.status).toBe(202);
 const frozen=(await pool.query('SELECT export_spec FROM app.export_jobs WHERE id=$1',[job.body.id])).rows[0].export_spec;
 const edit=await request(app).put(`/api/datasets/${d.id}`).set('If-Match','1').send({name:'人工订正',dataSpec:d.dataSpec});expect(edit.status).toBe(200);d=edit.body;
 const unchanged=await request(app).post(`/api/datasets/${d.id}/refresh`).set('If-Match','2').send({});expect(unchanged.status).toBe(200);expect(unchanged.body.version).toBe(2);expect(unchanged.body.syncStatus).toBe('edited');
 await request(app).post('/api/mock-bi/charts/chart-demo-budget/advance').send({scenario:'increase'});
 const refresh=await request(app).post(`/api/datasets/${d.id}/refresh`).set('If-Match','2').send({});expect(refresh.status).toBe(200);expect(refresh.body.version).toBe(3);
 expect((await pool.query('SELECT export_spec FROM app.export_jobs WHERE id=$1',[job.body.id])).rows[0].export_spec).toEqual(frozen);
 expect((await request(app).post('/api/export-jobs').set('Idempotency-Key',randomUUID()).send({slideId:page.body.id,revision:1,deliveryMode:'draft'})).status).toBe(409);
 await request(app).post('/api/mock-bi/charts/chart-demo-budget/advance').send({scenario:'fail'});
 const failed=await request(app).post(`/api/datasets/${d.id}/refresh`).set('If-Match','3').send({});expect(failed.status).toBe(503);
 const after=await request(app).get(`/api/datasets/${d.id}`);expect(after.body.version).toBe(3);expect(after.body.syncStatus).toBe('failed');
 await request(app).post('/api/mock-bi/charts/chart-demo-budget/advance').send({scenario:'recover'});
 const force=await request(app).post(`/api/datasets/${d.id}/refresh`).set('If-Match','3').send({force:true});expect(force.body.version).toBe(4);
 }finally{await pool.end()}
});
test('concurrent edit and page save cannot restore stale data; forged projection is discarded',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'concurrency') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,workerEnabled:false});
 const d=(await request(app).post('/api/datasets').send({name:'并发',dataSpec:await fixture()})).body;
 const p=(await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:d.id,templateId:'budget-comparison'})).body;
 const [a,b]=await Promise.all([request(app).put(`/api/datasets/${d.id}`).set('If-Match','1').send({name:'新版',dataSpec:d.dataSpec}),request(app).put(`/api/slides/${p.id}`).set('If-Match','1').send({...p,title:'保留布局',extensions:{dataset:{id:'forged'}}})]);
 expect(a.status).toBe(200);expect([200,409]).toContain(b.status);
 const latest=(await request(app).get(`/api/slides/${p.id}`)).body;expect(latest.snapshotRef).toBe(a.body.currentSnapshotId);expect(latest.extensions.dataset.id).toBe(d.id);
 const payload=(await pool.query('SELECT payload FROM app.slide_revisions WHERE slide_id=$1 ORDER BY revision DESC LIMIT 1',[p.id])).rows[0].payload;expect(payload.extensions?.dataset).toBeUndefined();
 const [x,y]=await Promise.all([request(app).put(`/api/datasets/${d.id}`).set('If-Match','2').send({name:'a',dataSpec:a.body.dataSpec}),request(app).put(`/api/datasets/${d.id}`).set('If-Match','2').send({name:'b',dataSpec:a.body.dataSpec})]);expect([x.status,y.status].sort()).toEqual([200,409]);
 }finally{await pool.end()}
});
test('valid schema rename publishes data and preserves broken bindings for explicit repair',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'bindings') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,workerEnabled:false});
 const d=(await request(app).post('/api/datasets').send({name:'绑定',dataSpec:await fixture()})).body;
 const p=(await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:d.id,templateId:'budget-comparison'})).body;
 const data=JSON.parse(JSON.stringify(d.dataSpec).replaceAll('"actual"','"actualRenamed"'));
 const updated=await request(app).put(`/api/datasets/${d.id}`).set('If-Match','1').send({name:d.name,dataSpec:data});expect(updated.status).toBe(200);
 const latest=(await request(app).get(`/api/slides/${p.id}`)).body;expect(latest.snapshotRef).toBe(updated.body.currentSnapshotId);expect(latest.bindings).toEqual(p.bindings);
 const preview=await request(app).post(`/api/slides/${p.id}/preview`).send({});expect(preview.status).toBe(200);expect(preview.body.diagnostics.some((x:any)=>x.severity==='error')).toBe(true);
 const exp=await request(app).post('/api/export-jobs').set('Idempotency-Key',randomUUID()).send({slideId:p.id,revision:latest.revision,deliveryMode:'final'});expect(exp.status).toBe(422);
 }finally{await pool.end()}
});
test('BI corrections and rollback survive failed checks and unchanged source recovery',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'recovery') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,workerEnabled:false});
 await request(app).post('/api/mock-bi/charts/chart-demo-trend/advance').send({scenario:'recover'});
 let d=(await request(app).post('/api/datasets/bi-import').send({chartId:'chart-demo-trend'})).body;
 const edited=structuredClone(d.dataSpec);const rows=edited.resultSets.find((r:any)=>r.id==='budget').rows;
 const first=rows[0],previousActual=first.actual;first.actual=String(Number(first.actual)+11);expect(first.actual).not.toBe(previousActual);
 let saved=await request(app).put(`/api/datasets/${d.id}`).set('If-Match',String(d.version)).send({name:'人工订正',dataSpec:edited});expect(saved.status).toBe(200);d=saved.body;expect(d.dataSpec.resultSets.find((r:any)=>r.id==='budget').rows[0].actual).toBe(first.actual);
 const assertRecovery=async(status:string)=>{
  await request(app).post('/api/mock-bi/charts/chart-demo-trend/advance').send({scenario:'fail'});
  expect((await request(app).post(`/api/datasets/${d.id}/refresh`).set('If-Match',String(d.version)).send({})).status).toBe(503);
  await request(app).post('/api/mock-bi/charts/chart-demo-trend/advance').send({scenario:'recover'});
  const recovered=await request(app).post(`/api/datasets/${d.id}/refresh`).set('If-Match',String(d.version)).send({});expect(recovered.status).toBe(200);expect(recovered.body.version).toBe(d.version);expect(recovered.body.syncStatus).toBe(status);expect(recovered.body.dataSpec).toEqual(d.dataSpec);
 };
 await assertRecovery('edited');
 const roll=await request(app).post(`/api/datasets/${d.id}/rollback`).set('If-Match',String(d.version)).send({version:1});expect(roll.status).toBe(200);d=roll.body;
 await assertRecovery('rolledBack');
 }finally{await pool.end()}
});

test('final BI export checks source, requires renewed review, and freezes operation and idempotent input',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'final') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,workerEnabled:false});
 await request(app).post('/api/mock-bi/charts/chart-demo-bridge/advance').send({scenario:'recover'});
 const d=(await request(app).post('/api/datasets/bi-import').send({chartId:'chart-demo-bridge'})).body;
 let p=(await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:d.id,templateId:'budget-comparison'})).body;
 let review=await request(app).post(`/api/slides/${p.id}/review`).send({revision:p.revision});expect(review.status).toBe(200);p=review.body;
 await request(app).post('/api/mock-bi/charts/chart-demo-bridge/advance').send({scenario:'increase'});
 const blocked=await request(app).post('/api/export-jobs').set('Idempotency-Key',randomUUID()).send({slideId:p.id,revision:p.revision,deliveryMode:'final'});expect(blocked.status).toBe(409);
 p=(await request(app).get(`/api/slides/${p.id}`)).body;expect(p.reviewState.status).toBe('needsReview');
 expect((await request(app).post(`/api/slides/${p.id}/preview`).send({})).status).toBe(200);
 review=await request(app).post(`/api/slides/${p.id}/review`).send({revision:p.revision});expect(review.status).toBe(200);p=review.body;
 const key=randomUUID(),input={slideId:p.id,revision:p.revision,deliveryMode:'final'};
 const exported=await request(app).post('/api/export-jobs').set('Idempotency-Key',key).send(input);expect(exported.status).toBe(202);
 const frozen=(await pool.query('SELECT export_spec FROM app.export_jobs WHERE id=$1',[exported.body.id])).rows[0].export_spec;expect(frozen.provenance.dataset.operation).toBe('refresh');expect(frozen.provenance.dataset.syncStatus).toBe('synced');
 await request(app).post('/api/mock-bi/charts/chart-demo-bridge/advance').send({scenario:'increase'});
 const replay=await request(app).post('/api/export-jobs').set('Idempotency-Key',key).send(input);expect(replay.status).toBe(202);expect(replay.body.id).toBe(exported.body.id);
 expect((await pool.query('SELECT export_spec FROM app.export_jobs WHERE id=$1',[exported.body.id])).rows[0].export_spec).toEqual(frozen);
 }finally{await pool.end()}
});

test('dataset ownership and trusted source boundaries reject cross-actor operations and origin injection',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=async()=>Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'isolation') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:await actor(),workerEnabled:false}),other=await createApp({pool,actorId:await actor(),workerEnabled:false});
 const d=(await request(app).post('/api/datasets').send({name:'私有数据',dataSpec:await fixture()})).body;
 expect((await request(other).get(`/api/datasets/${d.id}`)).status).toBe(404);
 expect((await request(other).put(`/api/datasets/${d.id}`).set('If-Match','1').send({name:'覆写',dataSpec:d.dataSpec})).status).toBe(404);
 for(const action of ['refresh','rollback'])expect((await request(other).post(`/api/datasets/${d.id}/${action}`).set('If-Match','1').send({version:1})).status).toBe(404);
 expect((await request(other).get('/api/datasets')).body.items.some((x:any)=>x.id===d.id)).toBe(false);
 const injected=structuredClone(d.dataSpec);injected.source.system='biStudio';
 expect((await request(app).put(`/api/datasets/${d.id}`).set('If-Match','1').send({name:d.name,dataSpec:injected})).status).toBe(422);
 expect((await request(app).post('/api/datasets').send({name:'伪来源',dataSpec:d.dataSpec,origin:{kind:'biStudio',chartId:'secret'}})).status).toBe(422);
 expect((await request(app).get(`/api/datasets/${d.id}`)).body.version).toBe(1);
 }finally{await pool.end()}
});
