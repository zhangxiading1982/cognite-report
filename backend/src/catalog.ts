import type {Express} from 'express';
import type {Pool} from 'pg';
import {compileSlide} from '@slidebi/presentation';
import {template,fail,HttpError,authorizeAssets,transaction} from './db';
import {createDataset,editDataset,getDataset,expectedVersion} from './datasets';
import {applyTemplate} from './template-application';
import {matchTemplate} from './template-matching';
import {scopeDataSpec} from './data-scope';
import {ensureTemplateExamples} from './template-examples';
const sampleView=(d:any)=>({...d,builtin:false,tags:[...new Set(Object.values(d.tags as Record<string,string[]>).flat())]});
const sampleInput=(body:any,old?:any)=>({...body,tags:Array.isArray(body.tags)?{...old?.tags,用途:old?.tags?.['用途']??['模板样本'],原样本标签:body.tags}:body.tags??old?.tags??{用途:['模板样本']}});
export async function registerCatalogRoutes(app:Express,pool:Pool,actor:number){
 await ensureTemplateExamples(pool,typeof actor==='number'?actor:Number((await pool.query("SELECT id FROM app.users WHERE username='marx'")).rows[0].id));
 async function sample(sid:string){
  const row=(await pool.query('SELECT id FROM app.datasets WHERE owner_id=$1 AND (id=$2 OR legacy_sample_id=$2) ORDER BY (id=$2) DESC LIMIT 1',[actor,sid])).rows[0];
  if(!row)fail(404,'SAMPLE_NOT_FOUND','数据不存在');return getDataset(pool,actor,row.id);
 }
 app.get('/api/samples',async(_q,r)=>r.json({items:await Promise.all((await pool.query(`SELECT id FROM app.datasets WHERE owner_id=$1 AND archived_at IS NULL AND tags->'用途' ? '模板样本' ORDER BY updated_at DESC,id`,[Number(actor)])).rows.map(async row=>sampleView(await getDataset(pool,Number(actor),row.id))))}));
 app.get('/api/samples/:id',async(q,r)=>r.json(sampleView(await sample(q.params.id))));
 app.post('/api/samples',async(q,r)=>r.status(201).json(sampleView(await transaction(pool,db=>createDataset(db,Number(actor),sampleInput(q.body))))));
 app.put('/api/samples/:id',async(q,r)=>{const old=await sample(q.params.id);r.json(sampleView(await editDataset(pool,Number(actor),old.id,expectedVersion(q),sampleInput(q.body,old))))});
 app.post('/api/templates/:id/preview',async(q,r)=>{
  const t=await template(pool,Number(actor),q.params.id);let data:any;let selected:any;
  if(q.body?.datasetId){data=(await getDataset(pool,Number(actor),q.body.datasetId)).dataSpec;}
  else if(q.body?.sampleId){selected=await sample(q.body.sampleId);data=selected.dataSpec;}
  else {data=t.payload.example?.dataSpec;if(!data)fail(422,'TEMPLATE_EXAMPLE_REQUIRED','该模板缺少独立样例，请重新保存模板以捕获样例');}
  const automatic=q.body?.bindings?undefined:matchTemplate(data,t);
  let s:any;try{s=!q.body?.datasetId&&!q.body?.sampleId&&t.payload.example?.slide?{...structuredClone(t.payload.example.slide),templateRef:{id:t.template_id,version:t.version},snapshotRef:data.snapshot.id}:applyTemplate(data,t,{bindings:q.body?.bindings??automatic?.bindings});}catch(e){if(e instanceof HttpError){r.json({compatible:false,diagnostics:[{severity:'error',code:e.code,message:e.message}],dataSpec:data,sample:selected?sampleView(selected):undefined,example:t.payload.example});return;}throw e;}
  data=scopeDataSpec(data,[...new Set(Object.values(s.bindings).map((b:any)=>b.resultSetId))] as string[]);
  if(selected)selected={...selected,dataSpec:data};
  await authorizeAssets(pool,Number(actor),s);const compiled=compileSlide(s,data,'draft');compiled.diagnostics=compiled.diagnostics.filter(d=>d.code!=='NEEDS_REVIEW');
  r.json({slide:s,dataSpec:data,compiled,diagnostics:compiled.diagnostics,compatible:!compiled.diagnostics.some(d=>d.severity==='error'),sample:selected?sampleView(selected):undefined,example:t.payload.example});
 });
 app.get('/api/datasets/:id/templates',async(q,r)=>{
  const {getDataset}=await import('./datasets');const dataset=await getDataset(pool,Number(actor),q.params.id),data=dataset.dataSpec;
  const rows=(await pool.query('SELECT DISTINCT ON(t.id) t.id FROM app.templates t JOIN app.template_versions v ON v.template_id=t.id WHERE (t.visibility=\'public\' OR t.owner_id=$1) AND t.archived_at IS NULL ORDER BY t.id,v.version DESC',[Number(actor)])).rows;
  const items=[];
  for(const row of rows){
   let t;try{t=await template(pool,Number(actor),row.id);}catch(e){if(e instanceof HttpError&&e.status===404)continue;throw e;}const match=matchTemplate(data,t);
   const chartType=t.payload.chartType??t.payload.defaultElements?.find((e:any)=>e.type==='chart')?.chartType;
   const hintType=chartType==='bar'?'comparison':chartType;
   const priority=dataset.templateIds.includes(t.template_id)?0:data.chartHints?.some((h:any)=>h.chartType===hintType)?1:2;
   items.push({templateId:t.template_id,name:t.name,scene:t.scene,compatible:match.status==='matched',...match,bindingSchema:t.payload.bindingSchema,chartType,priority});
  }
  items.sort((a,b)=>['matched','needsBinding','incompatible'].indexOf(a.status)-['matched','needsBinding','incompatible'].indexOf(b.status)||a.priority-b.priority||a.templateId.localeCompare(b.templateId));
  r.json({items});
 });
}
