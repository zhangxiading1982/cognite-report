import type {Express} from 'express';
import type {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {compileDeck,compileSlide,renderSlideSvg,type CompiledSlide} from '@slidebi/presentation';
import {type DB,id,hash,fail,assetReadCondition,HttpError,transaction,getSlide,getData,authorizeAssets,assetIds,bytesHash} from './db.ts';
import {refreshDataset} from './datasets.ts';

const view=(r:any)=>({id:r.deck_id,revision:r.revision,title:r.title,spec:r.spec,updatedAt:r.updated_at,ownerId:Number(r.owner_id),visibility:r.visibility});
export async function getDeck(db:DB,actor:number,did:string,revision?:number){
 const r=(await db.query('SELECT r.*,d.updated_at,d.visibility FROM app.decks d JOIN app.deck_revisions r ON r.deck_id=d.id AND r.revision=COALESCE($3,d.current_revision) WHERE d.id=$1 AND (d.owner_id=$2 OR d.visibility=\'public\') AND d.archived_at IS NULL',[did,actor,revision??null])).rows[0];
 if(!r)fail(404,'NOT_FOUND','汇报不存在');return {...view(r),canEdit:Number(r.owner_id)===Number(actor),canDelete:Number(r.owner_id)===Number(actor)};
}
function revision(value:any){if(!Number.isInteger(value)||value<1)fail(422,'INVALID_REVISION','请提供有效修订号');return value as number;}
function title(value:any){if(typeof value!=='string'||!value.trim()||value.trim().length>80)fail(422,'INVALID_TITLE','汇报标题为1至80字');return value.trim();}
function validId(v:any){return typeof v==='string'&&v.length>0&&v.length<=150;}
export async function validatedSpec(db:DB,actor:number,input:any,did:string,rev:number,allowEmpty=false){
 if(!input||typeof input!=='object'||Array.isArray(input))fail(422,'INVALID_DECK','汇报格式无效');
 const {sections,instances,structurePolicy:p,numbering:n}=input;
 if(!Array.isArray(sections)||sections.length>100||sections.length<1||!Array.isArray(instances)||(!allowEmpty&&instances.length<1)||instances.length>100)fail(422,'INVALID_DECK','汇报需包含1至100个章节和页面实例');
 const sectionIds=new Set<string>();
 for(const s of sections){if(!s||!validId(s.id)||sectionIds.has(s.id)||typeof s.title!=='string'||!s.title.trim()||s.title.length>48||!Number.isInteger(s.order))fail(422,'INVALID_SECTION','章节标识、名称或顺序无效');sectionIds.add(s.id);}
 const native=(await db.query('SELECT native_content FROM app.decks WHERE id=$1 AND owner_id=$2',[did,actor])).rows[0]?.native_content;
 const ownedIds=new Set<string>();
 const instanceIds=new Set<string>();
 for(const i of instances){if(!i||!validId(i.instanceId)||instanceIds.has(i.instanceId)||!sectionIds.has(i.sectionId)||!Number.isInteger(i.order)||typeof i.included!=='boolean'||!i.slideRef||!validId(i.slideRef.id)||!Number.isInteger(i.slideRef.revision)||i.slideRef.revision<1)fail(422,'INVALID_INSTANCE','页面实例无效');instanceIds.add(i.instanceId);const slide=await getSlide(db,actor,i.slideRef.id,i.slideRef.revision);if(slide.archivedAt)fail(422,'SLIDE_ARCHIVED','请移除已归档页面');if(native){const owner=(await db.query('SELECT content_deck_id FROM app.slides WHERE id=$1 AND owner_id=$2',[slide.id,actor])).rows[0];if(owner?.content_deck_id!==did||ownedIds.has(slide.id))fail(422,'PAGE_OWNERSHIP','请使用导入功能复制其他文稿页面');ownedIds.add(slide.id);}}
 if(!p||['cover','agenda','sectionDividers'].some(k=>typeof p[k]!=='boolean')||!Number.isInteger(p.agendaPageCapacity)||p.agendaPageCapacity<1||p.agendaPageCapacity>8||!n||!['contentOnly','physical'].includes(n.mode)||typeof n.showTotal!=='boolean')fail(422,'INVALID_STRUCTURE','结构和页码设置无效');
 return {id:did,revision:rev,title:title(input.title),sections:sections.map(s=>({id:s.id,title:s.title.trim(),order:s.order})),instances:instances.map(i=>({instanceId:i.instanceId,slideRef:{id:i.slideRef.id,revision:i.slideRef.revision},sectionId:i.sectionId,order:i.order,included:i.included})),structurePolicy:{cover:p.cover,agenda:p.agenda,sectionDividers:p.sectionDividers,agendaPageCapacity:p.agendaPageCapacity},numbering:{mode:n.mode,showTotal:n.showTotal}};
}
export async function saveRevision(db:DB,actor:number,spec:any){
 await db.query('INSERT INTO app.deck_revisions(deck_id,revision,owner_id,title,spec) VALUES($1,$2,$3,$4,$5)',[spec.id,spec.revision,actor,spec.title,spec]);
 for(const i of spec.instances)await db.query('INSERT INTO app.deck_slide_refs(deck_id,deck_revision,owner_id,instance_id,slide_id,slide_revision) VALUES($1,$2,$3,$4,$5,$6)',[spec.id,spec.revision,actor,i.instanceId,i.slideRef.id,i.slideRef.revision]);
}
export async function insertDeckJob(pool:Pool,actor:number,key:string,did:string,rev:number,pid:string,mode:string,exp:any,fingerprint:string){
 const prior=(await pool.query('SELECT * FROM app.export_jobs WHERE owner_id=$1 AND idempotency_key=$2',[actor,key])).rows[0];
 if(prior){if(prior.input_hash!==fingerprint||prior.deck_id!==did||prior.deck_revision!==rev||prior.preview_id!==pid||prior.delivery_mode!==mode)fail(409,'IDEMPOTENCY_CONFLICT','幂等键输入不同');return prior;}
 try{return (await pool.query('INSERT INTO app.export_jobs(id,owner_id,deck_id,deck_revision,preview_id,idempotency_key,input_hash,delivery_mode,export_spec) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[id('job'),actor,did,rev,pid,key,fingerprint,mode,exp])).rows[0];}
 catch(e:any){if(e.code==='23505')return insertDeckJob(pool,actor,key,did,rev,pid,mode,exp,fingerprint);throw e;}
}
export function registerDeckRoutes(app:Express,pool:Pool,actor:number,storageDir:string,jobView:(r:any)=>any,key:(req:any)=>string){
 app.get('/api/decks',async(_req,res)=>res.json({items:(await pool.query('SELECT r.*,d.updated_at,d.visibility FROM app.decks d JOIN app.deck_revisions r ON r.deck_id=d.id AND r.revision=d.current_revision WHERE d.owner_id=$1 AND d.archived_at IS NULL ORDER BY d.updated_at DESC,d.id',[Number(actor)])).rows.map(view)}));
 app.post('/api/decks',async(req,res)=>{
  const name=title(req.body.title),slideIds=req.body.slideIds;
  if(!Array.isArray(slideIds)||slideIds.length<1||slideIds.length>100||slideIds.some(s=>!validId(s)))fail(422,'INVALID_SLIDES','请选择1至100个页面');
  const made=await transaction(pool,async db=>{
   const did=id('deck'),sections=[{id:'overview',title:'概览',order:0},{id:'trend',title:'趋势',order:1},{id:'variance',title:'差异归因',order:2},{id:'other',title:'待归类',order:3}];
   const instances:any[]=[];for(const [order,sid] of slideIds.entries()){const s=await getSlide(db,Number(actor),sid);if(s.archivedAt)fail(422,'SLIDE_ARCHIVED','页面已归档');instances.push({instanceId:id('instance'),slideRef:{id:s.id,revision:s.revision},sectionId:({budgetComparison:'overview',monthlyTrend:'trend',revenueBridge:'variance'} as Record<string,string>)[s.scene]||'other',order,included:true});}
   const spec={id:did,revision:1,title:name,sections:sections.filter(s=>instances.some(i=>i.sectionId===s.id)),instances,structurePolicy:{cover:true,agenda:true,sectionDividers:true,agendaPageCapacity:8},numbering:{mode:'contentOnly',showTotal:true}};
   await db.query('INSERT INTO app.decks(id,owner_id,current_revision) VALUES($1,$2,1)',[did,Number(actor)]);await saveRevision(db,Number(actor),spec);return getDeck(db,Number(actor),did);
  });res.status(201).json(made);
 });
 app.get('/api/decks/:id',async(req,res)=>res.json(await getDeck(pool,Number(actor),req.params.id)));
 app.put('/api/decks/:id',async(req,res)=>{
  const expected=revision(req.body.revision);
  res.json(await transaction(pool,async db=>{await db.query('SELECT id FROM app.decks WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR UPDATE',[req.params.id,Number(actor)]);const old=await getDeck(db,Number(actor),req.params.id);if(old.revision!==expected)fail(409,'REVISION_CONFLICT','汇报已更新，请重新加载');const spec=await validatedSpec(db,Number(actor),req.body.spec,old.id,expected+1);await saveRevision(db,Number(actor),spec);await db.query('UPDATE app.decks SET current_revision=$2,updated_at=now() WHERE id=$1',[old.id,spec.revision]);return getDeck(db,Number(actor),old.id);}));
 });
 app.post('/api/decks/:id/archive',async(req,res)=>{await getDeck(pool,Number(actor),req.params.id);await pool.query('UPDATE app.decks SET archived_at=now(),updated_at=now() WHERE id=$1 AND owner_id=$2',[req.params.id,Number(actor)]);res.json({archived:true});});
 app.post('/api/decks/:id/preview',async(req,res)=>{
  const rev=revision(req.body.revision),mode=req.body.deliveryMode,policy=req.body.dataPolicy;
  if(!['draft','final'].includes(mode)||!['snapshot','latestRequired'].includes(policy))fail(422,'INVALID_POLICY','请选择数据和导出策略');
  const deck=await getDeck(pool,Number(actor),req.params.id);if(deck.revision!==rev)fail(409,'REVISION_CONFLICT','汇报已更新，请重新加载');
  const startedAt=new Date().toISOString();
  if(policy==='latestRequired'&&deck.canEdit){
   const datasets=new Set<string>();for(const i of deck.spec.instances.filter((i:any)=>i.included)){const s=await getSlide(pool,Number(actor),i.slideRef.id);if(s.extensions?.dataset?.refreshMode==='biStudioMock')datasets.add(s.extensions.dataset.id);for(const source of Object.values(s.extensions?.chartData??{}) as any[]){if(source.mode==='dataset'&&source.canEdit){const row=(await pool.query('SELECT origin,refresh_config FROM app.datasets WHERE id=$1 AND owner_id=$2',[source.datasetId,Number(actor)])).rows[0];if(row&&(row.refresh_config?.mode??(row.origin.kind==='biStudio'?'biStudioMock':'manual'))==='biStudioMock')datasets.add(source.datasetId);}}}
   for(const did of [...datasets].sort())await refreshDataset(pool,Number(actor),did);
  }
  const frozen=await transaction(pool,async db=>{
   // All page revisions, data and asset metadata are read from one database snapshot.
   await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
   const current=await getDeck(db,Number(actor),deck.id);if(current.revision!==rev)fail(409,'REVISION_CONFLICT','汇报已更新，请重新预览');
   const native=(await db.query('SELECT native_content FROM app.decks WHERE id=$1',[deck.id])).rows[0]?.native_content;
   const spec=structuredClone(current.spec),sources:Record<string,CompiledSlide>={},sourcePages:any[]=[];
   for(const i of spec.instances.filter((i:any)=>i.included)){
    const s=await getSlide(db,Number(actor),i.slideRef.id,policy==='snapshot'&&!native?i.slideRef.revision:undefined);if(s.archivedAt)fail(422,'SLIDE_ARCHIVED','请移除已归档页面');i.slideRef.revision=s.revision;
    const sourceKey=`${s.id}@${s.revision}`;if(sources[sourceKey])continue;
    const data=await getData(db,Number(actor),s.snapshotRef);await authorizeAssets(db,Number(actor),s);
    const c=compileSlide(s,data,mode);if(mode==='final'&&s.reviewState.status==='needsReview'&&!c.diagnostics.some(x=>x.code==='REVIEW_REQUIRED'))c.diagnostics.push({severity:'error',code:'REVIEW_REQUIRED',message:`页面「${s.title}」需要复核业务结论`});
    sources[sourceKey]=c;sourcePages.push({slideId:s.id,title:s.title,revision:s.revision,snapshotId:data.snapshot.id,snapshotHash:data.snapshot.contentHash,dataset:s.extensions?.dataset,reviewState:s.reviewState.status});
   }
   const compiled=compileDeck(spec,sources,mode);if(!compiled.slides.length&&compiled.diagnostics.some(x=>x.severity==='error'))throw new HttpError(422,'PREFLIGHT_FAILED','汇报预检失败：'+compiled.diagnostics.filter(x=>x.severity==='error').map(x=>x.message).join('；'),compiled.diagnostics);if(!compiled.slides.length||compiled.slides.length>100)fail(422,'DECK_PAGE_LIMIT','汇报总页数（含导航和章节页）须为1至100页');
   const refs=assetIds(compiled.slides),assets=refs.length?(await db.query(`SELECT a.id,o.storage_key,o.sha256,o.mime_type FROM app.assets a JOIN app.storage_objects o ON o.id=a.original_object_id WHERE a.id=ANY($1::text[]) AND ${assetReadCondition}`,[refs,Number(actor)])).rows:[];
   const previewId=id('preview'),exp={exportSpecVersion:'1.0',provenance:{deckId:deck.id,title:deck.title,revision:rev,previewId,dataPolicy:policy,consistency:policy==='latestRequired'?'bestEffortBatch':'frozenReferences',startedAt,finishedAt:new Date().toISOString(),generatorVersion:'slide-report-2',pages:sourcePages,resolvedDeckSpec:spec},canvas:compiled.slides[0].canvas,theme:compiled.slides[0].theme,assets,slides:compiled.slides,navigation:compiled.navigation,diagnostics:compiled.diagnostics};
   await db.query('INSERT INTO app.deck_previews(id,deck_id,deck_revision,owner_id,delivery_mode,export_spec) VALUES($1,$2,$3,$4,$5,$6)',[previewId,deck.id,rev,Number(actor),mode,exp]);return {previewId,exp};
  });
  const embedded:{id:string;dataUri:string}[]=[];for(const a of frozen.exp.assets){const bytes=await readFile(path.join(storageDir,a.storage_key));if(bytesHash(bytes)!==a.sha256)fail(410,'ASSET_UNAVAILABLE','资源校验失败');embedded.push({id:a.id,dataUri:`data:${a.mime_type};base64,${bytes.toString('base64')}`});}
  res.json({previewId:frozen.previewId,slides:frozen.exp.slides,svgs:frozen.exp.slides.map(s=>renderSlideSvg({...s,assets:embedded})),navigation:frozen.exp.navigation,diagnostics:frozen.exp.diagnostics,provenance:frozen.exp.provenance});
 });
 app.post('/api/decks/:id/export',async(req,res)=>{
  const k=key(req),rev=revision(req.body.revision),mode=req.body.deliveryMode,pid=req.body.previewId;
  const prior=(await pool.query('SELECT * FROM app.export_jobs WHERE owner_id=$1 AND idempotency_key=$2',[Number(actor),k])).rows[0];
  if(prior){if(prior.deck_id!==req.params.id||prior.deck_revision!==rev||prior.preview_id!==pid||prior.delivery_mode!==mode)fail(409,'IDEMPOTENCY_CONFLICT','幂等键输入不同');res.status(202).json(jobView(prior));return;}
  await getDeck(pool,Number(actor),req.params.id,rev);
  const p=(await pool.query('SELECT * FROM app.deck_previews WHERE id=$1 AND deck_id=$2 AND deck_revision=$3 AND owner_id=$4',[pid,req.params.id,rev,Number(actor)])).rows[0];if(!p)fail(404,'NOT_FOUND','冻结预览不存在');
  if(p.delivery_mode!==mode)fail(409,'PREVIEW_MODE_MISMATCH','导出模式已改变，请重新预览');
  const errors=p.export_spec.diagnostics.filter((d:any)=>d.severity==='error');if(errors.length)throw new HttpError(422,'PREFLIGHT_FAILED','汇报导出预检失败',errors);
  res.status(202).json(jobView(await insertDeckJob(pool,Number(actor),k,req.params.id,rev,pid,mode,p.export_spec,hash({exp:p.export_spec,mode}))));
 });
}
