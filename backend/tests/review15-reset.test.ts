import {afterAll,beforeAll,expect,test} from 'vitest';
import request from 'supertest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../src/app.ts';
import {fixture} from '../src/db.ts';
import {resetReview15ContentData} from '../src/review15-reset.ts';

const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
let storageDir:string;
beforeAll(async()=>{storageDir=await mkdtemp(path.join(os.tmpdir(),'review15-reset-'))});
afterAll(async()=>{await pool.end();await rm(storageDir,{recursive:true,force:true})});

test('reset keeps page design, restores template defaults, detaches managed data and seeds single-table inputs once',async()=>{
 const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'review15') RETURNING id",[randomUUID()])).rows[0].id);
 const app=await createApp({pool,actorId:actor,storageDir,workerEnabled:false});
 const managed=(await request(app).post('/api/datasets').send({name:'旧多表数据',dataSpec:await fixture(),preserveResultSets:true})).body;
 let page=(await request(app).post('/api/slides/from-template').set('Idempotency-Key',randomUUID()).send({templateId:'budget-comparison',datasetId:managed.id})).body;
 page.elements.push({id:'review15-note',type:'text',rect:{x:40,y:480,w:300,h:30},z:9,style:{fontSize:16},runs:[{text:'保留我的页面说明'}]});
 page=(await request(app).put(`/api/slides/${page.id}`).set('If-Match',String(page.revision)).send(page)).body;
 let content=(await request(app).post('/api/contents').send({title:'待清理文稿'})).body;
 content=(await request(app).post(`/api/contents/${content.id}/pages`).send({revision:content.revision,slideId:page.id})).body;

 const first=await resetReview15ContentData(pool,actor);
 expect(first).toMatchObject({pagesReset:1,multiTableDatasetsArchived:1});
 expect(first.singleTableDatasetsSeeded).toBeGreaterThan(0);
 const current=(await request(app).get(`/api/slides/${page.id}`)).body;
 const chart=current.elements.find((element:any)=>element.type==='chart');
 expect(current.revision).toBe(page.revision+1);
 expect(current.elements.find((element:any)=>element.id==='review15-note')?.runs[0].text).toBe('保留我的页面说明');
 expect(current.extensions.chartData[chart.id]).toMatchObject({mode:'private'});
 expect(current.extensions.chartData[chart.id].datasetId).toBeUndefined();
 expect(current.extensions.chartData[chart.id].dataSpec.resultSets).toHaveLength(1);
 expect((await pool.query('SELECT dataset_id FROM app.slides WHERE id=$1',[page.id])).rows[0].dataset_id).toBeNull();
 expect((await pool.query('SELECT archived_at FROM app.datasets WHERE id=$1',[managed.id])).rows[0].archived_at).not.toBeNull();
 const latestContent=(await request(app).get(`/api/contents/${content.id}`)).body;
 expect(latestContent.revision).toBe(content.revision+1);
 expect(latestContent.spec.instances[0].slideRef.revision).toBe(current.revision);

 const seedRows=await pool.query("SELECT ds.payload FROM app.datasets d JOIN app.data_snapshots ds ON ds.id=d.current_snapshot_id WHERE d.owner_id=$1 AND d.archived_at IS NULL AND d.origin->>'review'='15'",[actor]);
 expect(seedRows.rowCount).toBe(first.singleTableDatasetsSeeded);
 expect(seedRows.rows.every(row=>row.payload.resultSets.length===1)).toBe(true);
 const second=await resetReview15ContentData(pool,actor);
 expect(second).toMatchObject({pagesReset:0,multiTableDatasetsArchived:0,singleTableDatasetsSeeded:0});
});
