import {test,expect} from 'vitest';
import {validateDataSpec} from '@slidebi/presentation';
import {fixture} from '../src/db';
test('numeric field display metadata survives DataSpec validation without changing raw rows',async()=>{const d:any=await fixture();const field=d.resultSets.flatMap((r:any)=>r.fields).find((f:any)=>f.type==='decimal');field.unit='CNY';field.displayFormat={useGrouping:true,decimalPlaces:2};const result=validateDataSpec(d);expect(result.errors).toEqual([]);expect(result.data?.resultSets.flatMap(r=>r.fields).find(f=>f.id===field.id)).toMatchObject({displayFormat:{useGrouping:true,decimalPlaces:2}});expect(result.data?.resultSets[0].rows).toEqual(d.resultSets[0].rows);field.displayFormat.decimalPlaces=13;expect(validateDataSpec(d).valid).toBe(false)});

import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import {createApp} from '../src/app';
test('template and dataset PUT persist display format and preserve raw values across reloads',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
  const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'field display owner') RETURNING id",[randomUUID()])).rows[0].id);
  const app=await createApp({pool,actorId:actor,workerEnabled:false});
  const preview=await request(app).post('/api/templates/budget-comparison/preview').send({});expect(preview.status).toBe(200);
  const dataset=await request(app).post('/api/datasets').send({name:'格式数据',dataSpec:preview.body.dataSpec});expect(dataset.status).toBe(201);
  const slide=await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:dataset.body.id,templateId:'budget-comparison'});expect(slide.status).toBe(201);
  const dataSpec=structuredClone(dataset.body.dataSpec),field=dataSpec.resultSets[0].fields.find((f:any)=>f.type==='decimal');Object.assign(field,{name:'确认收入',unit:'USD',displayFormat:{useGrouping:true,decimalPlaces:2},description:'展示设置不改动金额'});
  const saved=await request(app).put(`/api/datasets/${dataset.body.id}`).set('If-Match','1').send({name:'格式数据',dataSpec});expect(saved.status,JSON.stringify(saved.body)).toBe(200);
  const loaded=await request(app).get(`/api/datasets/${dataset.body.id}`);expect(loaded.body.dataSpec.resultSets[0].fields.find((f:any)=>f.id===field.id)).toMatchObject(field);expect(loaded.body.dataSpec.resultSets[0].rows).toEqual(dataset.body.dataSpec.resultSets[0].rows);
  const slideAfter=await request(app).get(`/api/slides/${slide.body.id}`);expect(Object.values(slideAfter.body.bindings.main.roles).flat()).toContain(field.id);const renamedPreview=await request(app).post(`/api/slides/${slide.body.id}/preview`).send({});expect(renamedPreview.status).toBe(200);expect(renamedPreview.body.diagnostics.filter((item:any)=>item.severity==='error')).toEqual([]);
  const base=(await request(app).get('/api/templates/budget-comparison')).body;const imported=await request(app).post('/api/templates/import').send({...base,name:'格式模板'});expect(imported.status).toBe(201);
  const example=structuredClone(imported.body.example),templateField=example.dataSpec.resultSets[0].fields.find((f:any)=>f.type==='decimal');Object.assign(templateField,{unit:'CNY',displayFormat:{useGrouping:true,decimalPlaces:0}});
  const updated=await request(app).put(`/api/templates/${imported.body.id}`).send({expectedVersion:1,name:'格式模板',example});expect(updated.status,JSON.stringify(updated.body)).toBe(200);
  const template=await request(app).get(`/api/templates/${imported.body.id}`);expect(template.body.example.dataSpec.resultSets[0].fields.find((f:any)=>f.id===templateField.id)).toMatchObject(templateField);expect(template.body.example.dataSpec.resultSets[0].rows).toEqual(imported.body.example.dataSpec.resultSets[0].rows);
  field.displayFormat.decimalPlaces=13;const invalid=await request(app).put(`/api/datasets/${dataset.body.id}`).set('If-Match','2').send({name:'无效格式',dataSpec});expect(invalid.status).toBe(422);expect((await request(app).get(`/api/datasets/${dataset.body.id}`)).body.version).toBe(2);
 }finally{await pool.end()}
});
