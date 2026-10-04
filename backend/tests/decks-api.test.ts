import {beforeAll,afterAll,test,expect} from 'vitest';
import request from 'supertest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import JSZip from 'jszip';
import {writeDeckPptx} from '../src/export/pptx.ts';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../src/app.ts';
import {fixture} from '../src/db.ts';
const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
let storageDir:string;
beforeAll(async()=>{storageDir=await mkdtemp(path.join(os.tmpdir(),'slidebi-decks-'))});
afterAll(async()=>{await pool.end();await rm(storageDir,{recursive:true,force:true})});
async function context(){const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'decks') RETURNING id",[randomUUID()])).rows[0].id);return {actor,app:await createApp({pool,actorId:actor,storageDir,workerEnabled:false})};}
async function page(app:any){const d=await request(app).post('/api/datasets').send({name:'汇报数据',dataSpec:await fixture()});expect(d.status).toBe(201);const s=await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:d.body.id,templateId:'budget-comparison'});expect(s.status).toBe(201);return s.body;}
test('decks retain ordered revision references, isolate owners and reject stale saves',async()=>{
 const a=await context(),b=await context(),s=await page(a.app);
 const made=await request(a.app).post('/api/decks').send({title:'季度经营汇报',slideIds:[s.id,s.id]});expect(made.status).toBe(201);
 const deck=made.body;expect(deck.revision).toBe(1);expect(deck.spec.instances).toHaveLength(2);expect(deck.spec.instances[0].instanceId).not.toBe(deck.spec.instances[1].instanceId);
 expect((await request(b.app).get(`/api/decks/${deck.id}`)).status).toBe(404);
 expect((await request(b.app).post('/api/decks').send({title:'越权',slideIds:[s.id]})).status).toBe(404);
 expect((await request(a.app).put(`/api/decks/${deck.id}`).send({revision:1,spec:{...deck.spec,title:'更新'}})).status).toBe(200);
 expect((await request(a.app).put(`/api/decks/${deck.id}`).send({revision:1,spec:deck.spec})).status).toBe(409);
 expect((await request(a.app).post(`/api/decks/${deck.id}/archive`)).status).toBe(200);
 expect((await request(a.app).get('/api/decks')).body.items).toHaveLength(0);
});
test('preview freezes multipage output and export/retry retain exact input, while foreign previews fail',async()=>{
 const {app,actor}=await context(),s=await page(app);
 const made=await request(app).post('/api/decks').send({title:'经营汇报',slideIds:[s.id]});expect(made.status).toBe(201);const d=made.body;
 const p=await request(app).post(`/api/decks/${d.id}/preview`).send({revision:1,dataPolicy:'snapshot',deliveryMode:'draft'});expect(p.status).toBe(200);expect(p.body.slides).toHaveLength(4);expect(p.body.svgs).toHaveLength(4);
 const body={revision:1,previewId:p.body.previewId,deliveryMode:'draft'},key=randomUUID();
 const e=await request(app).post(`/api/decks/${d.id}/export`).set('Idempotency-Key',key).send(body);expect(e.status).toBe(202);expect(e.body.deckId).toBe(d.id);
 expect((await request(app).post(`/api/decks/${d.id}/export`).set('Idempotency-Key',key).send(body)).body.id).toBe(e.body.id);
 expect((await request(app).post(`/api/decks/${d.id}/export`).set('Idempotency-Key',key).send({...body,deliveryMode:'final'})).status).toBe(409);
 const row=(await pool.query('SELECT * FROM app.export_jobs WHERE id=$1 AND owner_id=$2',[e.body.id,actor])).rows[0];expect(row.export_spec.slides).toEqual(p.body.slides);expect(row.slide_id).toBeNull();
 await request(app).post(`/api/export-jobs/${e.body.id}/cancel`);
 const retried=await request(app).post(`/api/export-jobs/${e.body.id}/retry`).set('Idempotency-Key',randomUUID()).send({});expect(retried.status).toBe(202);expect(retried.body.deckId).toBe(d.id);expect(retried.body.inputHash).toBe(e.body.inputHash);
 const other=await request(app).post('/api/decks').send({title:'其他',slideIds:[s.id]});expect((await request(app).post(`/api/decks/${other.body.id}/export`).set('Idempotency-Key',randomUUID()).send(body)).status).toBe(404);
});
test('latestRequired refreshes Mock data before freezing, final requires review, failed refresh produces no partial preview',async()=>{
 const {app,actor}=await context();const chartId='chart-demo-budget';
 await request(app).post(`/api/mock-bi/charts/${chartId}/advance`).send({scenario:'recover'});
 const data=await request(app).post('/api/datasets/bi-import').send({chartId,name:'BI汇报数据'});expect(data.status).toBe(201);
 const pageResult=await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:data.body.id,templateId:'budget-comparison'});expect(pageResult.status).toBe(201);const s=pageResult.body;
 await request(app).post(`/api/slides/${s.id}/review`).send({revision:s.revision});
 const made=await request(app).post('/api/decks').send({title:'动态汇报',slideIds:[s.id,s.id]});const d=made.body;
 await request(app).post(`/api/mock-bi/charts/${chartId}/advance`).send({scenario:'increase'});
 const preview=await request(app).post(`/api/decks/${d.id}/preview`).send({revision:1,dataPolicy:'latestRequired',deliveryMode:'draft'});expect(preview.status).toBe(200);expect(preview.body.provenance.pages).toHaveLength(1);expect(preview.body.provenance.pages[0].revision).toBeGreaterThan(s.revision);expect(preview.body.provenance.pages[0].reviewState).toBe('needsReview');expect(preview.body.provenance.consistency).toBe('bestEffortBatch');
 const final=await request(app).post(`/api/decks/${d.id}/preview`).send({revision:1,dataPolicy:'latestRequired',deliveryMode:'final'});
 expect(final.status).toBe(200);expect(final.body.diagnostics.some((x:any)=>x.code==='REVIEW_REQUIRED')).toBe(true);expect((await request(app).post(`/api/decks/${d.id}/export`).set('Idempotency-Key',randomUUID()).send({revision:1,previewId:final.body.previewId,deliveryMode:'final'})).status).toBe(422);
 const before=Number((await pool.query('SELECT count(*) FROM app.deck_previews WHERE owner_id=$1',[actor])).rows[0].count);
 await request(app).post(`/api/mock-bi/charts/${chartId}/advance`).send({scenario:'fail'});
 try{expect((await request(app).post(`/api/decks/${d.id}/preview`).send({revision:1,dataPolicy:'latestRequired',deliveryMode:'draft'})).status).toBe(503);expect(Number((await pool.query('SELECT count(*) FROM app.deck_previews WHERE owner_id=$1',[actor])).rows[0].count)).toBe(before);
 // Frozen preview remains exportable despite subsequent upstream outage.
 const exported=await request(app).post(`/api/decks/${d.id}/export`).set('Idempotency-Key',randomUUID()).send({revision:1,previewId:preview.body.previewId,deliveryMode:'draft'});expect(exported.status).toBe(202);
 }finally{await request(app).post(`/api/mock-bi/charts/${chartId}/advance`).send({scenario:'recover'});}
});
test('invalid deck references/structures are rejected and persisted revisions/previews are immutable',async()=>{
 const {app}=await context(),s=await page(app);const d=(await request(app).post('/api/decks').send({title:'结构校验',slideIds:[s.id]})).body;
 for(const spec of [{...d.spec,sections:[d.spec.sections[0],d.spec.sections[0]]},{...d.spec,instances:[{...d.spec.instances[0],sectionId:'missing'}]},{...d.spec,instances:[{...d.spec.instances[0],slideRef:{id:s.id,revision:9999}}]},{...d.spec,structurePolicy:{...d.spec.structurePolicy,agendaPageCapacity:0}},{...d.spec,title:'x'.repeat(81)}]){const result=await request(app).put(`/api/decks/${d.id}`).send({revision:1,spec});expect([404,422]).toContain(result.status);}
 const p=await request(app).post(`/api/decks/${d.id}/preview`).send({revision:1,dataPolicy:'snapshot',deliveryMode:'draft'});expect(p.status).toBe(200);
 await expect(pool.query("UPDATE app.deck_previews SET delivery_mode='final' WHERE id=$1",[p.body.previewId])).rejects.toThrow();
 await expect(pool.query("UPDATE app.deck_revisions SET title='tampered' WHERE deck_id=$1",[d.id])).rejects.toThrow();
 const other=await context();expect((await request(other.app).post(`/api/decks/${d.id}/preview`).send({revision:1,dataPolicy:'snapshot',deliveryMode:'draft'})).status).toBe(404);
});
test('resource image bytes are embedded in the frozen deck preview and native multipage PPTX',async()=>{
 const {app}=await context(),s=await page(app);
 const uploaded=await request(app).post('/api/assets').attach('file',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="#2563eb"/></svg>'),'deck-image.svg');expect(uploaded.status).toBe(201);
 s.elements.push({id:'deck-image',type:'image',assetId:uploaded.body.id,rect:{x:820,y:390,w:96,h:72},z:10,fit:'contain'});
 const saved=await request(app).put(`/api/slides/${s.id}`).set('If-Match',String(s.revision)).send(s);expect(saved.status).toBe(200);
 const deck=(await request(app).post('/api/decks').send({title:'带图片汇报',slideIds:[s.id]})).body;
 const p=await request(app).post(`/api/decks/${deck.id}/preview`).send({revision:1,dataPolicy:'snapshot',deliveryMode:'draft'});expect(p.status).toBe(200);expect(p.body.svgs[3]).toContain('href="data:image/png;base64,');
 const frozen=(await pool.query('SELECT export_spec FROM app.deck_previews WHERE id=$1',[p.body.previewId])).rows[0].export_spec;
 expect(frozen.assets).toHaveLength(1);
 const output=path.join(storageDir,`${randomUUID()}.pptx`);await writeDeckPptx(frozen.slides,output,async aid=>path.join(storageDir,frozen.assets.find((a:any)=>a.id===aid).storage_key));
 const zip=await JSZip.loadAsync(await readFile(output));expect(Object.keys(zip.files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(4);
 const images=Object.values(zip.files).filter(f=>/^ppt\/media\/.*\.png$/.test(f.name));expect(images).toHaveLength(1);expect(await images[0].async('nodebuffer')).toEqual((await request(app).get(uploaded.body.url)).body);
});
