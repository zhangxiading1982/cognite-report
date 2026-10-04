import type {Express} from 'express';import type {Pool} from 'pg';
import {compileSlide,composeChartData} from '@slidebi/presentation';
import {type DB,id,hash,fail,HttpError,transaction,getSlide,getData,template,insertRevision,fixture} from './db.ts';
import {getDataset,storeData,expectedVersion} from './datasets.ts';import {applyTemplate} from './template-application.ts';
const isDataElement=(element:any)=>['chart','table'].includes(element?.type);
export function assertPrivateChartDataImmutable(before:any,input:any){
 const previous=before?.extensions?.chartData??{},next=input?.extensions?.chartData??{};
 for(const [chartId,source] of Object.entries(next) as [string,any][]){
  const old=previous[chartId];
  if(old?.mode==='private'&&source?.mode==='private'&&hash(old.dataSpec)!==hash(source.dataSpec))fail(422,'DATA_NOT_MANAGED','模板或页面自带数据为只读；请先复制到数据管理再修改');
 }
}
export async function lockChartDatasets(db:DB,actor:number,s:any){
 const ids=[...new Set((Object.values(s.extensions?.chartData??{}) as any[]).filter(x=>x?.mode==='dataset').map(x=>x.datasetId))].sort();
 for(const did of ids)if(!(await db.query("SELECT id FROM app.datasets WHERE id=$1 AND archived_at IS NULL AND (owner_id=$2 OR visibility='public') FOR SHARE",[did,actor])).rowCount)fail(404,'NOT_FOUND','数据集不存在');
}
export async function normalizeChartData(db:DB,actor:number,s:any,base:any){
 if(!s.extensions?.chartData)return {slide:s,data:base};
 // Once chart inputs are maintained independently, retain the legacy linked input as a whole.
 await db.query("UPDATE app.datasets SET scope_result_set_ids=ARRAY(SELECT x->>'id' FROM app.data_snapshots ds, jsonb_array_elements(ds.payload->'resultSets') x WHERE ds.id=app.datasets.current_snapshot_id) WHERE id=(SELECT dataset_id FROM app.slides WHERE id=$1 AND owner_id=$2) AND scope_result_set_ids IS NULL",[s.id,actor]);
 const entries:any={};
 for(const e of s.elements.filter(isDataElement)){
  const raw=s.extensions.chartData[e.id];if(!raw)continue;
  if(!raw.binding||!['private','dataset'].includes(raw.mode))fail(422,'INVALID_CHART_DATA','图表数据格式无效');
  if(raw.mode==='dataset'){const dataset=await getDataset(db,actor,raw.datasetId);if(dataset.archivedAt)fail(422,'DATASET_ARCHIVED','数据已删除');if(raw.datasetVersion!==undefined&&raw.datasetVersion!==dataset.version)fail(409,'VERSION_CONFLICT','图表引用的数据已更新，请重新加载');entries[e.id]={mode:'dataset',datasetId:dataset.id,datasetVersion:dataset.version,dataSpec:dataset.dataSpec,binding:raw.binding};}
  else entries[e.id]={mode:'private',dataSpec:await storeData(db,actor,raw.dataSpec),binding:raw.binding};
 }
 s.extensions.chartData=entries;const composed=composeChartData(s,base),data=await storeData(db,actor,composed.data);composed.slide.snapshotRef=data.snapshot.id;composed.slide.reviewState={status:'needsReview',snapshotId:data.snapshot.id};return {slide:composed.slide,data};
}
function check(s:any,d:any){const c=compileSlide(s,d,'draft'),errors=c.diagnostics.filter((x:any)=>x.severity==='error');if(errors.length)throw new HttpError(422,'INVALID_CHART_DATA','图表数据与字段绑定不匹配',errors)}
export function registerChartDataRoutes(app:Express,pool:Pool,actor:number,key:(r:any)=>string){
 for(const kind of ['blank','from-template'])app.post(`/api/slides/${kind}`,async(req,res)=>{
  const k=key(req),fp=hash({kind,...req.body});res.status(201).json(await transaction(pool,async db=>{
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${Number(actor)}:${k}`]);
   const prior=(await db.query('SELECT * FROM app.slides WHERE owner_id=$1 AND creation_key=$2',[Number(actor),k])).rows[0];if(prior){if(prior.creation_hash!==fp)fail(409,'IDEMPOTENCY_CONFLICT','幂等键输入不同');return getSlide(db,Number(actor),prior.id)}
   const t=await template(db,Number(actor),kind==='blank'?'budget-comparison':req.body.templateId),example=t.payload.example;
   const base=await storeData(db,Number(actor),example?.dataSpec??await fixture());
   let s:any=example?.slide?structuredClone(example.slide):applyTemplate(base,t,req.body);s.id=id('slide');s.revision=1;s.title=req.body.title?.trim()||(kind==='blank'?'空白页':t.name);if(!s.title||s.title.length>300)fail(422,'INVALID_TITLE','页面名称需为1至300字');s.templateRef={id:t.template_id,version:t.version};s.snapshotRef=base.snapshot.id;s.reviewState={status:'needsReview',snapshotId:base.snapshot.id};s.extensions={};
   if(kind==='from-template')s.elements=s.elements.filter((element:any)=>element.type!=='sourceFooter');
   if(kind==='blank'){s.elements=[];s.bindings={};s.annotations=[];}else{s.extensions.chartData={};for(const e of s.elements.filter((e:any)=>e.type==='chart'))s.extensions.chartData[e.id]=req.body.datasetId?{mode:'dataset',datasetId:req.body.datasetId,binding:req.body.bindings?.[e.bindingRef]??s.bindings[e.bindingRef]}:{mode:'private',dataSpec:base,binding:s.bindings[e.bindingRef]};}
   if(kind==='from-template'&&req.body.datasetId){const dataset=await getDataset(db,Number(actor),req.body.datasetId);for(const source of Object.values(s.extensions.chartData) as any[]){if(!dataset.dataSpec.resultSets.some((r:any)=>r.id===source.binding.resultSetId)){const fields=(Object.values(source.binding.roles).flat() as string[]),matches=dataset.dataSpec.resultSets.filter((r:any)=>fields.every(f=>r.fields.some((x:any)=>x.id===f)));if(matches.length===1)source.binding={...source.binding,resultSetId:matches[0].id};}}}
   await lockChartDatasets(db,Number(actor),s);
   const normalized=await normalizeChartData(db,Number(actor),s,base);s=normalized.slide;check(s,normalized.data);
   await db.query('INSERT INTO app.slides(id,owner_id,current_revision,creation_key,creation_hash) VALUES($1,$2,1,$3,$4)',[s.id,Number(actor),k,fp]);await insertRevision(db,Number(actor),s);return getSlide(db,Number(actor),s.id);
  }));
 });
 app.get('/api/slides/:id/chart-data/:chartId',async(req,res)=>{
  const s=await getSlide(pool,Number(actor),req.params.id),e=s.elements.find((x:any)=>x.id===req.params.chartId&&isDataElement(x));if(!e)fail(404,'CHART_NOT_FOUND','图表或表格不存在');
  const owner=(await pool.query('SELECT owner_id,dataset_id FROM app.slides WHERE id=$1',[s.id])).rows[0];let source=s.extensions?.chartData?.[e.id];
  if(!source){const binding=structuredClone(s.bindings[e.bindingRef]);if(e.type==='table'&&!binding.roles?.columns)binding.roles={...binding.roles,columns:[...(e.fields||[])]};source={mode:owner.dataset_id?'dataset':'private',...(owner.dataset_id?{datasetId:owner.dataset_id}:{}),dataSpec:await getData(pool,Number(owner.owner_id),s.snapshotRef),binding};}
  let canEdit=Number(owner.owner_id)===Number(actor);if(source.mode==='dataset'){try{const d=await getDataset(pool,Number(actor),source.datasetId);source={...source,dataSpec:d.dataSpec,datasetVersion:d.version};canEdit=canEdit&&d.canEdit}catch{canEdit=false}}
  res.json({...source,canEdit});
 });
 app.put('/api/slides/:id/chart-data/:chartId',async(req,res)=>res.json(await transaction(pool,async db=>{
  const expected=expectedVersion(req),before=await getSlide(db,Number(actor),req.params.id),candidate={...before,extensions:{...before.extensions,chartData:{...before.extensions?.chartData,[req.params.chartId]:req.body}}};assertPrivateChartDataImmutable(before,candidate);await lockChartDatasets(db,Number(actor),candidate);if(!(await db.query('SELECT 1 FROM app.slides WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR UPDATE',[req.params.id,Number(actor)])).rowCount)fail(403,'OWNER_REQUIRED','仅owner可以修改页面');
  let s=await getSlide(db,Number(actor),req.params.id);if(s.revision!==expected)fail(409,'REVISION_CONFLICT','页面已更新，请重新加载');if(!s.elements.some((e:any)=>e.id===req.params.chartId&&isDataElement(e)))fail(404,'CHART_NOT_FOUND','图表或表格不存在');
  s.extensions={...s.extensions,chartData:{...s.extensions?.chartData,[req.params.chartId]:req.body}};const result=await normalizeChartData(db,Number(actor),s,await getData(db,Number(actor),s.snapshotRef));s=result.slide;s.revision++;check(s,result.data);await db.query('UPDATE app.slides SET current_revision=$2,updated_at=now() WHERE id=$1',[s.id,s.revision]);await insertRevision(db,Number(actor),s);return getSlide(db,Number(actor),s.id);
 })));
}
