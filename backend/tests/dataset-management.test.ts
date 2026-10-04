import {test,expect} from 'vitest';
import request from 'supertest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app';
import {fixture} from '../src/db';
test('explicit copy is independent; versioned edits keep identity; used inputs cannot be deleted',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'management') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,workerEnabled:false});
 const original=(await request(app).post('/api/datasets').send({name:'独立输入',dataSpec:await fixture()})).body;
 const copy=await request(app).post(`/api/datasets/${original.id}/copy`).set('If-Match','1').send({name:'维护副本'});
 expect(copy.status).toBe(201);expect(copy.body.id).not.toBe(original.id);expect(copy.body.version).toBe(1);expect(copy.body.origin.kind).toBe('manual');expect(copy.body.origin.copiedFrom.datasetId).toBe(original.id);
 const edit=await request(app).put(`/api/datasets/${copy.body.id}`).set('If-Match','1').send({name:'修改副本',dataSpec:copy.body.dataSpec});expect(edit.status).toBe(200);expect(edit.body.id).toBe(copy.body.id);expect(edit.body.version).toBe(2);
 expect((await request(app).get(`/api/datasets/${original.id}`)).body.name).toBe('独立输入');
 const slide=(await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:original.id,templateId:'budget-comparison'})).body;
 const used=(await request(app).get(`/api/datasets/${original.id}`)).body;expect(used.canDelete).toBe(false);expect(used.references.slides.map((p:any)=>p.id)).toContain(slide.id);
 const blocked=await request(app).delete(`/api/datasets/${original.id}`).set('If-Match','1');expect(blocked.status).toBe(409);expect(blocked.body.code).toBe('DATASET_IN_USE');expect(blocked.body.fieldErrors.slides[0].id).toBe(slide.id);
 expect((await request(app).delete(`/api/datasets/${copy.body.id}`).set('If-Match','1')).status).toBe(409);
 expect((await request(app).delete(`/api/datasets/${copy.body.id}`).set('If-Match','2')).status).toBe(200);
 expect((await request(app).get('/api/datasets')).body.items.some((d:any)=>d.id===copy.body.id)).toBe(false);
 expect((await request(app).put(`/api/datasets/${copy.body.id}`).set('If-Match','2').send({name:'恢复',dataSpec:copy.body.dataSpec})).status).toBe(404);
 expect((await pool.query('SELECT count(*) FROM app.dataset_versions WHERE dataset_id=$1',[copy.body.id])).rows[0].count).toBe('2');
 const sample=(await request(app).post('/api/datasets').send({name:'样本',dataSpec:await fixture(),tags:{用途:['模板样本']},templateIds:['budget-comparison']})).body;
 expect((await request(app).delete(`/api/datasets/${sample.id}`).set('If-Match','1')).status).toBe(200);
 }finally{await pool.end()}
});

test('mixed existing inputs split once, move current page links and preserve immutable history',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'split') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,workerEnabled:false});
 const original=(await request(app).post('/api/datasets').send({name:'综合月报',dataSpec:await fixture(),templateIds:['budget-comparison','monthly-trend','revenue-bridge'],tags:{用途:['模板样本','页面数据']}})).body;
 const slide=(await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:original.id,templateId:'monthly-trend'})).body;
 const old=(await pool.query('SELECT payload FROM app.slide_revisions WHERE slide_id=$1 AND revision=1',[slide.id])).rows[0].payload;
 const list=(await request(app).get('/api/datasets')).body.items;
 const children=list.filter((d:any)=>d.splitFromId===original.id);expect(children).toHaveLength(3);expect(children.every((d:any)=>d.dataSpec.resultSets.length===1)).toBe(true);expect(list.some((d:any)=>d.id===original.id)).toBe(false);
 const trend=children.find((d:any)=>d.scopeResultSetIds.includes('trend'));expect(trend.templateIds).toEqual(['monthly-trend']);
 const latest=(await request(app).get(`/api/slides/${slide.id}`)).body;expect(latest.extensions.dataset.id).toBe(trend.id);expect(latest.snapshotRef).toBe(trend.currentSnapshotId);expect(latest.bindings).toEqual(slide.bindings);
 expect((await pool.query('SELECT payload FROM app.slide_revisions WHERE slide_id=$1 AND revision=1',[slide.id])).rows[0].payload).toEqual(old);
 const again=(await request(app).get('/api/datasets')).body.items;expect(again.filter((d:any)=>d.splitFromId===original.id).map((d:any)=>d.id).sort()).toEqual(children.map((d:any)=>d.id).sort());
 const edit=await request(app).put(`/api/datasets/${trend.id}`).set('If-Match','1').send({name:'趋势订正',dataSpec:trend.dataSpec});expect(edit.status).toBe(200);expect(edit.body.id).toBe(trend.id);expect(edit.body.version).toBe(2);
 const unscoped=await request(app).put(`/api/datasets/${trend.id}`).set('If-Match','2').send({name:'重新混合',dataSpec:original.dataSpec});expect(unscoped.status).toBe(422);
 }finally{await pool.end()}
});

test('split import and scoped mock refresh keep each managed input scoped',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'scoped-bi') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,workerEnabled:false});
 const manual=await request(app).post('/api/datasets/split-import').send({name:'拆分导入',dataSpec:await fixture()});expect(manual.status).toBe(201);expect(manual.body.items).toHaveLength(3);
 await request(app).post('/api/mock-bi/charts/chart-demo-trend/advance').send({scenario:'recover'});
 const imported=await request(app).post('/api/datasets/bi-import').send({chartId:'chart-demo-trend',splitInputs:true});expect(imported.status).toBe(201);expect(imported.body.items).toHaveLength(3);expect(imported.body.scopeResultSetIds).toEqual(['trend']);
 const d=imported.body;await request(app).post('/api/mock-bi/charts/chart-demo-trend/advance').send({scenario:'increase'});
 const fresh=await request(app).post(`/api/datasets/${d.id}/refresh`).set('If-Match','1').send({});expect(fresh.status).toBe(200);expect(fresh.body.id).toBe(d.id);expect(fresh.body.version).toBe(2);expect(fresh.body.dataSpec.resultSets.map((r:any)=>r.id)).toEqual(['trend']);
 expect(fresh.body.origin).toEqual(d.origin);
 }finally{await pool.end()}
});

test('scoped BI splits preserve prior manual correction on unchanged source and retain multi-input templates',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'preserve') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,workerEnabled:false});
 await request(app).post('/api/mock-bi/charts/chart-demo-budget/advance').send({scenario:'recover'});
 const d=(await request(app).post('/api/datasets/bi-import').send({chartId:'chart-demo-budget'})).body;
 const edited=structuredClone(d.dataSpec);edited.resultSets.find((r:any)=>r.id==='budget').rows[0].actual='99999';
 expect((await request(app).put(`/api/datasets/${d.id}`).set('If-Match','1').send({name:d.name,dataSpec:edited})).status).toBe(200);
 const list=(await request(app).get('/api/datasets')).body.items;const budget=list.find((x:any)=>x.splitFromId===d.id&&x.scopeResultSetIds.includes('budget'));
 const fresh=await request(app).post(`/api/datasets/${budget.id}/refresh`).set('If-Match','1').send({});expect(fresh.status).toBe(200);expect(fresh.body.version).toBe(1);expect(fresh.body.dataSpec.resultSets[0].rows[0].actual).toBe('99999');
 const data=(await request(app).post('/api/datasets').send({name:'复合模板',dataSpec:await fixture()})).body;
 const page=(await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:data.id,templateId:'budget-comparison'})).body;
 const extra=structuredClone(page.bindings.main);extra.resultSetId='trend';extra.roles={categoryKey:'month',series:['actual']};extra.computations=[];
 // A saved template may deliberately retain more than one binding even when its primary chart uses one.
 const tid=`template-${randomUUID()}`;
 await pool.query("INSERT INTO app.templates(id,owner_id,visibility) VALUES($1,$2,'private')",[tid,actor]);
 await pool.query("INSERT INTO app.template_versions(template_id,version,name,scene,theme_id,theme_version,payload) VALUES($1,1,'复合样本','budgetComparison','corporate-blue',1,$2)",[tid,{requiredBindings:{},slots:[],allowedControls:['text'],exportCapabilities:['nativeChart'],defaultBindings:{...page.bindings,secondary:extra},defaultElements:page.elements,canvas:page.canvas}]);
 expect((await request(app).put(`/api/datasets/${data.id}`).set('If-Match','1').send({name:data.name,dataSpec:data.dataSpec,tags:{用途:['模板样本']},templateIds:[tid,'budget-comparison']})).status).toBe(200);
 const split=(await request(app).get('/api/datasets')).body.items;const composite=split.find((x:any)=>x.id===data.id);expect(composite.scopeStatus).toBe('composite');expect(composite.templateIds).toEqual([tid]);expect(composite.version).toBe(3);
 expect(composite.references.templates).toEqual([]);expect(composite.canDelete).toBe(true);
 }finally{await pool.end()}
});
