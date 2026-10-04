import {test,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import {createApp} from '../src/app';
import {PHASE2_TEMPLATES} from '@slidebi/presentation';
test('seven chart templates own independent example data, typed roles and actual SVG/native compilation',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'phase2') RETURNING id",[randomUUID()])).rows[0].id);const app=await createApp({pool,actorId:actor,workerEnabled:false});
 const templates=(await request(app).get('/api/templates')).body.items;
 for(const def of PHASE2_TEMPLATES){const template=templates.find((t:any)=>t.id===def.id);expect(template.chartType).toBe(def.chartType);expect(template.bindingSchema.main.roles).toBeDefined();const preview=await request(app).post(`/api/templates/${def.id}/preview`).send({});expect(preview.status).toBe(200);expect(preview.body.compatible).toBe(true);expect(preview.body.compiled.elements.some((e:any)=>e.chartType===def.chartType)).toBe(true);const dataset=await request(app).post('/api/datasets').send({name:def.name,dataSpec:preview.body.dataSpec,templateIds:[def.id]});expect(dataset.status).toBe(201);const page=await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:dataset.body.id,templateId:def.id});expect(page.status).toBe(201);expect(page.body.elements.some((e:any)=>e.chartType===def.chartType)).toBe(true);}
 const datasets=(await request(app).get('/api/datasets')).body.items;for(const t of PHASE2_TEMPLATES){const ds=datasets.find((d:any)=>d.templateIds.includes(t.id));expect(ds.dataSpec.resultSets).toHaveLength(1);const matches=(await request(app).get(`/api/datasets/${ds.id}/templates`)).body.items;expect(matches.find((x:any)=>x.templateId===t.id).compatible).toBe(true);}
 }finally{await pool.end()}
});
