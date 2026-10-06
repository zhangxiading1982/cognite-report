import {composeChartData} from '@slidebi/presentation';
import type {Express,Request} from 'express';
import type {Pool} from 'pg';
import {validateDataSpec} from '@slidebi/presentation';
import {type DB,id,hash,omit,fail,HttpError,transaction,getData,getSlide,insertRevision,template} from './db.ts';
import {defaultRefreshConfig,validateRefreshConfig,fetchConfiguredMock} from './query-config.ts';
import {scopeDataSpec} from './data-scope.ts';
import {ensureScopedDatasets,splitDataset,createSplitDatasets} from './dataset-inputs.ts';
import {mockFetchDataSpec,registerMockBiRoutes} from './mock-bi.ts';
import {loadRuntimeConfig} from './config.ts';
import {completeDataSpecSchema} from './data-schema.ts';
export async function datasetMetadata(db:DB,actor:number,input:any,old:any={tags:{用途:['页面数据']},template_ids:[]}){
 const raw=input.tags===undefined?old.tags:input.tags;
 if(!raw||Array.isArray(raw)||typeof raw!=='object'||Object.keys(raw).length>12)fail(422,'INVALID_TAGS','标签最多12个类型');
 const tags:Record<string,string[]>={};
 for(const [type,values] of Object.entries(raw)){
  const key=type.trim();if(!key||key.length>30||!Array.isArray(values)||values.length>12||values.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>50))fail(422,'INVALID_TAGS','标签类型最多30字，每类型最多12个50字标签');
  const merged=[...new Set([...(Object.prototype.hasOwnProperty.call(tags,key)?tags[key]:[]),...values.map(v=>v.trim())])];if(merged.length>12)fail(422,'INVALID_TAGS','每类型最多12个标签');
  Object.defineProperty(tags,key,{value:merged,enumerable:true,writable:true,configurable:true});
 }
 const rawIds=input.templateIds===undefined?old.template_ids:input.templateIds;
 if(!Array.isArray(rawIds)||rawIds.length>50||rawIds.some(t=>typeof t!=='string'||!t.trim()))fail(422,'INVALID_TEMPLATES','关联模板格式无效');
 const templateIds=[...new Set(rawIds.map(t=>t.trim()))];for(const tid of templateIds)await template(db,actor,tid);
 return {tags,templateIds};
}
function preserveResultSets(input:any){
 if(input.preserveResultSets!==undefined&&typeof input.preserveResultSets!=='boolean')fail(422,'INVALID_INPUT_GROUP','preserveResultSets 必须为布尔值');
 if(input.preserveResultSets===true&&input.splitInputs===true)fail(422,'INVALID_INPUT_GROUP','保留关联多表与拆分输入不能同时启用');
 return input.preserveResultSets===true;
}
export async function createDataset(db:DB,actor:number,input:any){
 const preserve=preserveResultSets(input);
 if(input.origin)fail(422,'IMMUTABLE_ORIGIN','来源由系统建立');
 const metadata=await datasetMetadata(db,actor,input);
 const d=await storeData(db,actor,input.dataSpec);const did=await attachDataset(db,actor,d.snapshot.id,input.name,metadata,input.refreshConfig===undefined?null:validateRefreshConfig(input.refreshConfig,d));
 if(preserve||d.resultSets.length===1)await db.query('UPDATE app.datasets SET scope_result_set_ids=$2 WHERE id=$1',[did,d.resultSets.map((r:any)=>r.id)]);
 return getDataset(db,actor,did);
}
export async function editDataset(pool:Pool,actor:number,did:string,expected:number,input:any){
 return transaction(pool,async db=>{const r=await lockDataset(db,actor,did);if(r.version!==expected)fail(409,'VERSION_CONFLICT','数据已更新，请重新加载');
 const old=await getData(db,Number(r.owner_id),r.current_snapshot_id);if((input.origin&&hash(input.origin)!==hash(r.origin))||(!input.dataSpec?.source||hash(input.dataSpec.source)!==hash(old.source)))fail(422,'IMMUTABLE_ORIGIN','来源身份不可修改');
 if(r.scope_result_set_ids&&input.dataSpec.resultSets.some((rs:any)=>!r.scope_result_set_ids.includes(rs.id)))fail(422,'INPUT_SCOPE_CHANGED','此数据只维护当前模板输入，请另建数据导入其他结果集');
 const metadata={...await datasetMetadata(db,actor,input,r),refreshConfig:input.refreshConfig===undefined?(r.refresh_config?validateRefreshConfig(r.refresh_config,input.dataSpec):null):validateRefreshConfig(input.refreshConfig,input.dataSpec)};return publish(db,actor,r,input.name,input.dataSpec,'edit',undefined,metadata);
 });
}
export async function getDataset(db:DB,actor:number,datasetId:string){
 const r=(await db.query("SELECT d.*,u.username AS owner_username,u.display_name AS owner_display_name FROM app.datasets d JOIN app.users u ON u.id=d.owner_id WHERE d.id=$1 AND (d.owner_id=$2 OR (d.visibility='public' AND d.archived_at IS NULL))",[datasetId,actor])).rows[0];
 if(!r)fail(404,'NOT_FOUND','数据集不存在');
 const relatedSlides=(await db.query('SELECT s.id,r.title,s.current_revision AS revision FROM app.slides s JOIN app.slide_revisions r ON r.slide_id=s.id AND r.revision=s.current_revision WHERE s.dataset_id=$1 AND s.owner_id=$2 AND s.archived_at IS NULL ORDER BY s.updated_at DESC',[datasetId,actor])).rows;
 const references=await datasetReferences(db,actor,r.id,r.template_ids,r.tags);
 return {dataId:r.data_id,ownerId:r.owner_id,owner:{id:r.owner_id,username:r.owner_username,displayName:r.owner_display_name},canEdit:Number(r.owner_id)===Number(actor),visibility:r.visibility,folderId:r.folder_id,refreshConfig:r.refresh_config??defaultRefreshConfig(await getData(db,Number(r.owner_id),r.current_snapshot_id),r.origin),archivedAt:r.archived_at,scopeResultSetIds:r.scope_result_set_ids,splitFromId:r.split_from_id,scopeStatus:r.split_completed_at&&!r.archived_at&&!r.scope_result_set_ids?'composite':'single',references,canDelete:Number(r.owner_id)===Number(actor)&&!r.archived_at&&!references.slides.length&&!references.templates.length,tags:r.tags,templateIds:r.template_ids,relatedSlides,id:r.id,name:r.name,version:r.version,currentSnapshotId:r.current_snapshot_id,origin:r.origin,updatedAt:r.updated_at,syncStatus:r.sync_status,lastCheckedAt:r.last_checked_at,lastSyncedAt:r.last_synced_at,syncError:r.sync_error,dataSpec:await getData(db,Number(r.owner_id),r.current_snapshot_id)};
}
export async function lockDataset(db:DB,actor:number,datasetId:string){
 const r=(await db.query('SELECT * FROM app.datasets WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR UPDATE',[datasetId,actor])).rows[0];if(!r)fail(404,'NOT_FOUND','数据集不存在');return r;
}
export function expectedVersion(req:Request){const raw=req.get('If-Match')?.replaceAll('"','');if(!raw||!/^\d+$/.test(raw))fail(428,'VERSION_REQUIRED','请提供 If-Match 当前版本');return Number(raw)}
const semanticHash=(d:any)=>hash(omit(d,['id','snapshot','extensions']));
export async function storeData(db:DB,actor:number,input:any){
 const d=completeDataSpecSchema(input);if(!d||typeof d!=='object')fail(422,'INVALID_DATA_SPEC','数据格式无效');
 d.id=id('data');d.snapshot={...d.snapshot,id:id('snapshot'),capturedAt:new Date().toISOString(),consistency:d.snapshot?.consistency==='fixture'?'fixture':'importedSnapshot'};
 delete d.snapshot.contentHash;delete d.snapshot.hash;
 const v=validateDataSpec(d);if(!v.valid)throw new HttpError(422,'INVALID_DATA_SPEC','数据校验失败',v.errors);
 d.snapshot.contentHash=hash(d);
 await db.query('INSERT INTO app.data_snapshots(id,owner_id,data_spec_id,spec_version,content_hash,captured_at,data_as_of,consistency,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[d.snapshot.id,actor,d.id,d.specVersion,d.snapshot.contentHash,d.snapshot.capturedAt,d.snapshot.dataAsOf||null,d.snapshot.consistency,omit(d,['id','specVersion','snapshot'])]);return d;
}
export async function attachDataset(db:DB,actor:number,snapshot:string,name='导入数据',metadata={tags:{用途:['页面数据']} as Record<string,string[]>,templateIds:[] as string[]},refreshConfig:any=null){
 if(typeof name!=='string'||!name.trim()||name.length>200)fail(422,'INVALID_NAME','名称需为1至200字');
 const prior=(await db.query('SELECT dataset_id FROM app.dataset_versions WHERE snapshot_id=$1',[snapshot])).rows[0];if(prior)return prior.dataset_id;
 const did=id('dataset');await db.query('INSERT INTO app.datasets(id,owner_id,name,current_snapshot_id,origin,tags,template_ids,refresh_config) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[did,actor,name.slice(0,200),snapshot,{kind:'manual',importedAt:new Date().toISOString()},metadata.tags,metadata.templateIds,refreshConfig]);await db.query("INSERT INTO app.dataset_versions(dataset_id,version,name,snapshot_id,operation,tags,template_ids,refresh_config) VALUES($1,1,$2,$3,'import',$4,$5,$6)",[did,name.slice(0,200),snapshot,metadata.tags,metadata.templateIds,refreshConfig]);return did;
}
export async function publish(db:DB,actor:number,r:any,name:string,input:any,operation:string,upstreamHash?:string,metadata:{tags:any,templateIds:string[],refreshConfig?:any}={tags:r.tags,templateIds:r.template_ids}){
 if(typeof name!=='string'||!name.trim()||name.length>200)fail(422,'INVALID_NAME','名称需为1至200字');
 const d=await storeData(db,actor,input),version=r.version+1,config=metadata.refreshConfig===undefined?r.refresh_config:metadata.refreshConfig;
 await db.query('UPDATE app.datasets SET name=$2,version=$3,current_snapshot_id=$4,updated_at=now(),sync_status=$5,upstream_hash=COALESCE($6,upstream_hash),tags=$7,template_ids=$8,refresh_config=$9 WHERE id=$1',[r.id,name,version,d.snapshot.id,operation==='refresh'?'synced':operation==='rollback'?'rolledBack':(config?.mode??(r.origin.kind==='biStudio'?'biStudioMock':'manual'))==='biStudioMock'?'edited':'current',upstreamHash??null,metadata.tags,metadata.templateIds,config]);
 await db.query('INSERT INTO app.dataset_versions(dataset_id,version,name,snapshot_id,operation,tags,template_ids,refresh_config) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[r.id,version,name,d.snapshot.id,operation,metadata.tags,metadata.templateIds,config]);
 const pages=(await db.query("SELECT s.id,s.owner_id,s.dataset_id FROM app.slides s JOIN app.slide_revisions v ON v.slide_id=s.id AND v.revision=s.current_revision WHERE s.archived_at IS NULL AND (s.dataset_id=$1 OR EXISTS(SELECT 1 FROM jsonb_each(COALESCE(v.payload->'extensions'->'chartData','{}'::jsonb)) e WHERE e.value->>'datasetId'=$1)) ORDER BY s.id FOR UPDATE OF s",[r.id])).rows;
 for(const p of pages){let s=await getSlide(db,Number(p.owner_id),p.id);let data=p.dataset_id===r.id?d:await getData(db,Number(p.owner_id),s.snapshotRef);
  if(s.extensions?.chartData){for(const source of Object.values(s.extensions.chartData) as any[])if(source.mode==='dataset'&&source.datasetId===r.id){source.dataSpec=d;source.datasetVersion=version}const composed=composeChartData(s,data);s=composed.slide;data=await storeData(db,Number(p.owner_id),composed.data);}
  s.revision++;s.snapshotRef=data.snapshot.id;s.reviewState={status:'needsReview',snapshotId:data.snapshot.id};await db.query('UPDATE app.slides SET current_revision=$2,updated_at=now() WHERE id=$1',[s.id,s.revision]);await insertRevision(db,Number(p.owner_id),s)}
 return getDataset(db,actor,r.id);
}
async function fetchBI(chartId:string){
 if(!loadRuntimeConfig().biStudioBaseUrl)return mockFetchDataSpec(chartId);
 fail(503,'BI_ADAPTER_NOT_IMPLEMENTED','真实BI接口尚未实现；请使用明确标识的mock连接器');
}
const inFlight=new WeakMap<Pool,Map<string,Promise<any>>>();
export async function refreshDataset(pool:Pool,actor:number,did:string,expected?:number,force=false,check=false){
 let requests=inFlight.get(pool);if(!requests){requests=new Map();inFlight.set(pool,requests)}
 const key=`${actor}:${did}:${expected??''}:${force}:${check}`;
 if(requests.has(key))return requests.get(key);
 const task=runRefresh(pool,actor,did,expected,force,check);requests.set(key,task);
 try{return await task}finally{requests.delete(key)}
}
async function runRefresh(pool:Pool,actor:number,did:string,expected?:number,force=false,check=false){
 try{return await transaction(pool,async db=>{const r=await lockDataset(db,actor,did);if(expected!==undefined&&r.version!==expected)fail(409,'VERSION_CONFLICT','数据已更新，请重新加载');if((r.refresh_config?.mode??(r.origin.kind==='biStudio'?'biStudioMock':'manual'))!=='biStudioMock')fail(422,'NOT_BI_DATASET','仅BI数据支持源端更新');if(check&&!force&&!r.sync_error&&r.last_checked_at&&Date.now()-new Date(r.last_checked_at).getTime()<30000)return getDataset(db,actor,did);const current=await getData(db,Number(r.owner_id),r.current_snapshot_id),upstream=r.refresh_config?await fetchConfiguredMock(r.refresh_config,current):await fetchBI(r.origin.chartId),d=r.scope_result_set_ids?scopeDataSpec(upstream,r.scope_result_set_ids.filter((rid:string)=>current.resultSets.some((rs:any)=>rs.id===rid))):upstream,fingerprint=semanticHash(d);let result;if(force||r.upstream_hash!==fingerprint)result=await publish(db,actor,r,r.name,d,'refresh',fingerprint);await db.query("UPDATE app.datasets SET last_checked_at=now(),last_synced_at=CASE WHEN $2 THEN now() ELSE last_synced_at END,sync_error=NULL,sync_status=CASE WHEN sync_status='failed' THEN CASE (SELECT operation FROM app.dataset_versions WHERE dataset_id=$1 ORDER BY version DESC LIMIT 1) WHEN 'edit' THEN 'edited' WHEN 'rollback' THEN 'rolledBack' ELSE 'synced' END ELSE sync_status END WHERE id=$1",[did,!!result]);return getDataset(db,actor,did)});}catch(e:any){if(!['VERSION_CONFLICT','NOT_BI_DATASET','NOT_FOUND'].includes(e.code))await pool.query("UPDATE app.datasets SET last_checked_at=now(),sync_error=$3,sync_status='failed' WHERE id=$1 AND owner_id=$2",[did,actor,e.message]);throw e}
}
export function registerDatasetRoutes(app:Express,pool:Pool,actor:number){
 registerMockBiRoutes(app);
 app.get('/api/data-sources',(_req,res)=>res.json({items:[{id:'operations-demo',modelId:'operations-demo',name:'经营分析（Mock）',mode:'biStudioMock',languages:['dax']}]}));
 app.put('/api/datasets/:id/refresh-config',async(req,res)=>{const current=await getDataset(pool,Number(actor),req.params.id);res.json(await editDataset(pool,Number(actor),req.params.id,expectedVersion(req),{name:current.name,dataSpec:current.dataSpec,refreshConfig:validateRefreshConfig(req.body.refreshConfig,current.dataSpec)}))});
 app.get('/api/datasets',async(_q,res)=>{
  const owner=Number(actor);if(_q.query.view!=='chart')await ensureScopedDatasets(pool,owner);
  const rows=(await pool.query("SELECT id FROM app.datasets WHERE (owner_id=$1 OR visibility='public') AND archived_at IS NULL ORDER BY updated_at DESC",[owner])).rows;
  const items=await Promise.all(rows.map(async r=>{try{return await getDataset(pool,owner,r.id)}catch(error){
   // Public visibility may be revoked after the ID query. Omit that row while retaining authorization checks.
   if(error instanceof HttpError&&error.status===404)return null;throw error;
  }}));res.json({items:items.filter(Boolean)});
 });
 app.post('/api/datasets/split-import',async(req,res)=>res.status(201).json(await transaction(pool,db=>createSplitDatasets(db,Number(actor),req.body))));
 app.post('/api/datasets/:id/copy',async(req,res)=>res.status(201).json(await copyDataset(pool,Number(actor),req.params.id,expectedVersion(req),req.body)));
 app.delete('/api/datasets/:id',async(req,res)=>res.json(await deleteDataset(pool,Number(actor),req.params.id,expectedVersion(req))));
 app.post('/api/datasets',async(req,res)=>res.status(201).json(await transaction(pool,db=>createDataset(db,Number(actor),req.body))));
 app.post('/api/datasets/bi-import',async(req,res)=>{const preserve=preserveResultSets(req.body);if(typeof req.body.chartId!=='string'||!req.body.chartId.trim())fail(422,'CHART_ID_REQUIRED','请选择chartId');const d=await fetchBI(req.body.chartId);res.status(201).json(await transaction(pool,async db=>{const metadata=await datasetMetadata(db,Number(actor),req.body),config=req.body.refreshConfig===undefined?null:validateRefreshConfig(req.body.refreshConfig,d);const data=await storeData(db,Number(actor),d),did=id('dataset'),name=req.body.name||req.body.chartId;await db.query("INSERT INTO app.datasets(id,owner_id,name,current_snapshot_id,origin,upstream_hash,sync_status,last_checked_at,last_synced_at,tags,template_ids,refresh_config) VALUES($1,$2,$3,$4,$5,$6,'synced',now(),now(),$7,$8,$9)",[did,Number(actor),name,data.snapshot.id,{kind:'biStudio',importedAt:new Date().toISOString(),chartId:req.body.chartId,connectionId:'default',transport:loadRuntimeConfig().biStudioBaseUrl?'http':'mock',upstream:d.source},semanticHash(d),metadata.tags,metadata.templateIds,config]);await db.query("INSERT INTO app.dataset_versions(dataset_id,version,name,snapshot_id,operation,tags,template_ids,refresh_config) VALUES($1,1,$2,$3,'import',$4,$5,$6)",[did,name,data.snapshot.id,metadata.tags,metadata.templateIds,config]);if(preserve)await db.query('UPDATE app.datasets SET scope_result_set_ids=$2 WHERE id=$1',[did,d.resultSets.map((r:any)=>r.id)]);if(req.body.splitInputs===true){const items=await splitDataset(db,Number(actor),did);const preferred=req.body.chartId.includes('trend')?'trend':req.body.chartId.includes('bridge')?'bridge':'budget';return {...(items.find((x:any)=>x.scopeResultSetIds?.includes(preferred))??items[0]),items};}return getDataset(db,Number(actor),did)}))});
 app.get('/api/datasets/:id',async(req,res)=>res.json(await getDataset(pool,Number(actor),req.params.id)));
 app.put('/api/datasets/:id',async(req,res)=>res.json(await editDataset(pool,Number(actor),req.params.id,expectedVersion(req),req.body)));
 app.get('/api/datasets/:id/versions',async(req,res)=>{await getDataset(pool,Number(actor),req.params.id);res.json({items:(await pool.query('SELECT * FROM app.dataset_versions WHERE dataset_id=$1 ORDER BY version DESC LIMIT 6',[req.params.id])).rows.map(r=>({version:r.version,name:r.name,refreshConfig:r.refresh_config,tags:r.tags,templateIds:r.template_ids,snapshotId:r.snapshot_id,operation:r.operation,createdAt:r.created_at,canRollback:true}))})});
 app.post('/api/datasets/:id/rollback',async(req,res)=>{const expected=expectedVersion(req);res.json(await transaction(pool,async db=>{const r=await lockDataset(db,Number(actor),req.params.id);if(r.version!==expected)fail(409,'VERSION_CONFLICT','数据已更新，请重新加载');const v=(await db.query('SELECT * FROM app.dataset_versions WHERE dataset_id=$1 AND version=$2 AND version>$3-6',[r.id,req.body.version,r.version])).rows[0];if(!v)fail(422,'VERSION_UNAVAILABLE','仅支持最近6个版本');return publish(db,Number(actor),r,v.name,await getData(db,Number(actor),v.snapshot_id),'rollback',undefined,{tags:v.tags,templateIds:v.template_ids,refreshConfig:v.refresh_config})}))});
 app.post('/api/datasets/:id/refresh',async(req,res)=>res.json(await refreshDataset(pool,Number(actor),req.params.id,expectedVersion(req),req.body.force===true,req.body.check===true)));
 app.get('/api/slides/:id/lineage',async(req,res)=>{const s=await getSlide(pool,Number(actor),req.params.id);const row=(await pool.query('SELECT dataset_id,owner_id FROM app.slides WHERE id=$1',[s.id])).rows[0];let dataset=null;if(row.dataset_id){try{dataset=await getDataset(pool,Number(actor),row.dataset_id)}catch(e:any){if(e.status!==404)throw e}}res.json({dataset,dataSpec:await getData(pool,Number(row.owner_id),s.snapshotRef),snapshotId:s.snapshotRef,version:dataset?.version??null,slideRevision:s.revision})});
}

export async function datasetReferences(db:DB,actor:number,did:string,templateIds?:string[],tags?:any){
 const slides=(await db.query("SELECT s.id,CASE WHEN s.owner_id=$2 THEN r.title ELSE '公开数据引用页面' END AS title,s.current_revision AS revision FROM app.slides s JOIN app.slide_revisions r ON r.slide_id=s.id AND r.revision=s.current_revision WHERE s.archived_at IS NULL AND (s.dataset_id=$1 OR EXISTS(SELECT 1 FROM jsonb_each(COALESCE(r.payload->'extensions'->'chartData','{}'::jsonb)) e WHERE e.value->>'datasetId'=$1)) ORDER BY s.id",[did,actor])).rows;
 const templates:any[]=[];
 return {slides,templates};
}
export async function copyDataset(pool:Pool,actor:number,did:string,expected:number,input:any){
 return transaction(pool,async db=>{
  const r=await lockDataset(db,actor,did);if(r.version!==expected)fail(409,'VERSION_CONFLICT','数据已更新，请重新加载');
  const d=await storeData(db,actor,await getData(db,Number(r.owner_id),r.current_snapshot_id));const copy=id('dataset'),name=input.name??`${r.name} 副本`.slice(0,200);
  if(typeof name!=='string'||!name.trim()||name.length>200)fail(422,'INVALID_NAME','名称需为1至200字');
  const origin={kind:'manual',importedAt:new Date().toISOString(),copiedFrom:{datasetId:did,version:r.version,origin:r.origin}};
  await db.query('INSERT INTO app.datasets(id,owner_id,name,current_snapshot_id,origin,tags,template_ids,scope_result_set_ids,refresh_config) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[copy,actor,name,d.snapshot.id,origin,r.tags,r.template_ids,r.scope_result_set_ids??d.resultSets.map((rs:any)=>rs.id),r.refresh_config]);
  await db.query("INSERT INTO app.dataset_versions(dataset_id,version,name,snapshot_id,operation,tags,template_ids,refresh_config) VALUES($1,1,$2,$3,'copy',$4,$5,$6)",[copy,name,d.snapshot.id,r.tags,r.template_ids,r.refresh_config]);
  return getDataset(db,actor,copy);
 });
}
export async function deleteDataset(pool:Pool,actor:number,did:string,expected:number){
 return transaction(pool,async db=>{
  const r=await lockDataset(db,actor,did);if(r.version!==expected)fail(409,'VERSION_CONFLICT','数据已更新，请重新加载');
  const references=await datasetReferences(db,actor,did,r.template_ids,r.tags);
  if(references.slides.length||references.templates.length)throw new HttpError(409,'DATASET_IN_USE','此数据已被引用，无法删除；请先解除页面关联',references);
  await db.query('UPDATE app.datasets SET archived_at=now(),updated_at=now() WHERE id=$1',[did]);return {deleted:true,id:did};
 });
}
