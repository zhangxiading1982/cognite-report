import {test,expect} from 'vitest';import request from 'supertest';import {Pool} from 'pg';import {randomUUID} from 'node:crypto';import {createApp} from '../src/app';
test('personal phase2 templates preserve extra component bindings and chart role schema',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});let app:any;
 try{const actor=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'template reuse') RETURNING id",[randomUUID()])).rows[0].id);app=await createApp({pool,actorId:actor,workerEnabled:false});
 const preview=(await request(app).post('/api/templates/revenue-margin-combo/preview').send({})).body;
 const dataset=(await request(app).post('/api/datasets').send({name:'独立图表数据',dataSpec:preview.dataSpec})).body;
 const original=(await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:dataset.id,templateId:'revenue-margin-combo'})).body;
 const narrative=original.elements.find((e:any)=>e.type==='text');narrative.runs=[{text:'业务复盘结论保持独立'}];
 original.bindings.extra={resultSetId:original.bindings.main.resultSetId,roles:{}};original.elements.push({id:'extra-table',type:'table',rect:{x:40,y:100,w:800,h:300},z:7,style:{fontSize:12},bindingRef:'extra',fields:['revenue']});
 const rs=preview.dataSpec.resultSets.find((r:any)=>r.id===original.bindings.main.resultSetId);original.elements.at(-1).fields=[rs.fields[0].id];
 const saved=await request(app).put(`/api/slides/${original.id}`).set('If-Match','1').send(original);expect(saved.status).toBe(200);
 const created=await request(app).post('/api/templates').send({slideId:original.id,name:'phase2 template'});expect(created.status).toBe(201);expect(created.body.defaultElements.find((e:any)=>e.id===narrative.id).runs[0].text).toBe('业务复盘结论保持独立');expect(created.body.example.dataSpec.resultSets).toHaveLength(1);expect(created.body.example.businessContext.background).toBeTruthy();expect(created.body.chartType).toBe('combo');expect(created.body.bindingSchema.main.roles.lineSeries).toBeDefined();
 const copy=await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:dataset.id,templateId:created.body.id});expect(copy.status).toBe(201);expect(copy.body.bindings.extra).toEqual(original.bindings.extra);expect(copy.body.elements.some((e:any)=>e.type==='table')).toBe(true);
 }finally{await app?.locals.close();await pool.end()}
});
