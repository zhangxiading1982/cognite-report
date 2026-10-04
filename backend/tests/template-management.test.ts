import {test,expect} from 'vitest';
import {createSlide} from '@slidebi/presentation';
import {fixture} from '../src/db';
import {captureTemplateExample} from '../src/template-examples';
import {prepareTemplateDraft, assertTemplateOwner} from '../src/template-management';
test('only owner may maintain a template, including public templates',()=>{expect(()=>assertTemplateOwner({owner_id:1},2)).toThrow();expect(()=>assertTemplateOwner({owner_id:1},1)).not.toThrow()});
test('template edit captures independent sample and preserves narrative/layout in new defaults',async()=>{const d=await fixture();const s=createSlide(d,'budget-comparison');const e:any=s.elements.find((e:any)=>e.type==='text');e.runs=[{text:'业绩总结'}];const t:any={name:'原模板',version:2,payload:{example:captureTemplateExample(d,s)}};const draft=prepareTemplateDraft(t,{expectedVersion:2,name:'新模板',visibility:'public',example:t.payload.example});expect(draft.name).toBe('新模板');expect(draft.payload.defaultElements.find((x:any)=>x.id===e.id).runs[0].text).toBe('业绩总结');expect(draft.payload.example.dataSpec.id).not.toBe(d.id);expect(draft.payload.defaultBindings).toEqual(s.bindings);expect(()=>prepareTemplateDraft(t,{expectedVersion:1})).toThrow();expect(()=>prepareTemplateDraft(t,{expectedVersion:2,name:' '})).toThrow()});

import express from 'express';
import request from 'supertest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {registerTemplateManagement} from '../src/template-management';
import {registerFolderRoutes} from '../src/folders';
test('template API versions owner edits, rejects other users and archives without deleting history',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});const id=`template-${randomUUID()}`;let owner:number|undefined;
 try{owner=Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'template owner') RETURNING id",[id])).rows[0].id);const data=await fixture();const slide=createSlide(data,'budget-comparison');const example=captureTemplateExample(data,slide);await pool.query("INSERT INTO app.templates(id,owner_id,visibility) VALUES($1,$2,'public')",[id,owner]);await pool.query("INSERT INTO app.template_versions(template_id,version,name,scene,theme_id,theme_version,payload) VALUES($1,1,'测试模板','budgetComparison','corporate-blue',1,$2)",[id,{example,requiredBindings:{},canvas:slide.canvas,slots:[],defaultElements:slide.elements,allowedControls:[],exportCapabilities:[]}]);
 const appFor=(actor:number)=>{const app=express();app.use(express.json());registerTemplateManagement(app,pool,actor);app.use((e:any,_q:any,r:any,_n:any)=>r.status(e.status||500).json({message:e.message}));return app};const app=appFor(owner);
 expect((await request(appFor(-1)).put(`/api/templates/${id}`).send({expectedVersion:1,name:'侵入'})).status).toBe(403);
 const saved=await request(app).put(`/api/templates/${id}`).send({expectedVersion:1,name:'修改模板',example});expect(saved.status).toBe(200);expect(saved.body.version).toBe(2);
 expect((await request(app).put(`/api/templates/${id}`).send({expectedVersion:1,name:'覆盖'})).status).toBe(409);
 expect((await request(app).patch(`/api/templates/${id}/metadata`).send({expectedVersion:2,visibility:'private'})).status).toBe(200);
 expect((await request(appFor(-1)).get(`/api/templates/${id}`)).status).toBe(404);
 expect((await request(app).delete(`/api/templates/${id}`).send({expectedVersion:3})).status).toBe(204);
 expect((await request(app).get(`/api/templates/${id}`)).status).toBe(404);
 expect(Number((await pool.query('SELECT count(*) FROM app.template_versions WHERE template_id=$1',[id])).rows[0].count)).toBe(3);
 }finally{await pool.end()}
});

import {applyTemplate} from '../src/template-application';
import {compileSlide,renderSlideSvg} from '@slidebi/presentation';
test('unchanged public seed templates preserve generated computed KPI content',async()=>{
 const data=await fixture();const legacy=await fixture('trend.slide');const t={template_id:'monthly-trend',version:1,visibility:'public',scene:'monthlyTrend',theme_id:'corporate-blue',theme_version:1,payload:{defaultElements:legacy.elements,canvas:legacy.canvas}};
 const slide=applyTemplate(data,t,{});expect(renderSlideSvg(compileSlide(slide,data,'draft'))).toContain('10.7%');
});
test('imports independent private template and validates folder ownership with versioned moves',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});let templateId:string|undefined;const folder=`folder-${randomUUID()}`;
 try{const users=(await pool.query("SELECT id,username FROM app.users WHERE username IN('marx','summer')")).rows;const owner=Number(users.find(u=>u.username==='marx').id),other=Number(users.find(u=>u.username==='summer').id);
 const app=express();app.use(express.json());registerTemplateManagement(app,pool,owner);registerFolderRoutes(app,pool,owner);app.use((e:any,_q:any,r:any,_n:any)=>r.status(e.status||500).json({message:e.message}));
 const data=await fixture(),slide=createSlide(data,'budget-comparison'),example=captureTemplateExample(data,slide);
 await pool.query("INSERT INTO app.folders(id,kind,name,owner_id) VALUES($1,'templates','其他用户目录',$2)",[folder,other]);
 const imported=await request(app).post('/api/templates/import').send({name:'导入商业汇报',scene:'budgetComparison',example,visibility:'public'});expect(imported.status).toBe(201);templateId=imported.body.id;expect(imported.body.visibility).toBe('private');expect(imported.body.ownerId).toBe(owner);expect(imported.body.example.dataSpec.id).not.toBe(data.id);
 expect((await request(app).patch(`/api/templates/${templateId}/metadata`).send({expectedVersion:1,folderId:folder})).status).toBe(404);
 await pool.query('UPDATE app.folders SET owner_id=$2 WHERE id=$1',[folder,owner]);
 const moved=await request(app).patch(`/api/templates/${templateId}/metadata`).send({expectedVersion:1,folderId:folder});expect(moved.status).toBe(200);expect(moved.body.folderId).toBe(folder);expect(moved.body.version).toBe(2);expect((await request(app).delete(`/api/folders/${folder}`)).status).toBe(409);
 expect((await request(app).patch(`/api/templates/${templateId}/metadata`).send({expectedVersion:1,folderId:null})).status).toBe(409);
 expect((await request(app).post('/api/templates/import').send({name:'错误',example:{}})).status).toBe(422);
 }finally{if(templateId)await pool.query('UPDATE app.templates SET folder_id=NULL WHERE id=$1',[templateId]);await pool.query('DELETE FROM app.folders WHERE id=$1',[folder]);await pool.end()}
});

test('template draft retains editable schema descriptions and display units',async()=>{const d=await fixture(),slide=createSlide(d,'budget-comparison');const example=captureTemplateExample(d,slide);const field=example.dataSpec.resultSets[0].fields[0];field.description='业务区域';field.unit='个';field.name='区域名称';const draft=prepareTemplateDraft({name:'模板',version:1,payload:{example}},{expectedVersion:1,example});expect(draft.payload.example.dataSpec.resultSets[0].fields[0]).toMatchObject({name:'区域名称',description:'业务区域',unit:'个'})});
