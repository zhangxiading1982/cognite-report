import type {Pool} from 'pg';
import {type DB,id,hash,omit,transaction,getData,getSlide,insertRevision,template} from './db.ts';
import {storeData,getDataset,lockDataset,createDataset,publish} from './datasets.ts';
import {scopeDataSpec} from './data-scope.ts';
import {applyTemplate} from './template-application.ts';
import {matchTemplate} from './template-matching.ts';

const resultIds=(bindings:any)=>[...new Set(Object.values(bindings??{}).map((b:any)=>b.resultSetId).filter(Boolean))] as string[];

/** Split current input only; immutable snapshots and past page/export revisions remain intact. */
export async function splitDataset(db:DB,actor:number,did:string){
 const r=await lockDataset(db,actor,did),data=await getData(db,actor,r.current_snapshot_id);
 if(r.refresh_config?.queries?.length&&new Set(r.refresh_config.queries.map((q:any)=>q.chartGroup??'main')).size===1){await db.query('UPDATE app.datasets SET scope_result_set_ids=$2 WHERE id=$1',[did,data.resultSets.map((rs:any)=>rs.id)]);return [await getDataset(db,actor,did)];}
 if(data.resultSets.length<2)return [await getDataset(db,actor,did)];
 if(r.split_completed_at)return Promise.all((await db.query('SELECT id FROM app.datasets WHERE split_from_id=$1 AND archived_at IS NULL ORDER BY id',[did])).rows.map(x=>getDataset(db,actor,x.id)));
 const required=new Map<string,string[]>();
 for(const tid of r.template_ids){
  try{const t=await template(db,actor,tid),match=matchTemplate(data,t),s=applyTemplate(data,t,{bindings:match.bindings});required.set(tid,resultIds(s.bindings));}catch{/* Invalid historical template links stay on the original input for repair. */}
 }
 const previousUpstream=r.origin.kind==='biStudio'?(await db.query("SELECT snapshot_id FROM app.dataset_versions WHERE dataset_id=$1 AND operation IN ('import','refresh') ORDER BY version DESC LIMIT 1",[did])).rows[0]:null;
 const upstreamData=previousUpstream?await getData(db,actor,previousUpstream.snapshot_id):data;
 const children:any[]=[];
 const groups=new Map<string,string[]>();for(const rs of data.resultSets){const q=r.refresh_config?.queries?.find((q:any)=>q.resultSetId===rs.id),key=q?(q.chartGroup??'main'):rs.id;groups.set(key,[...(groups.get(key)??[]),rs.id]);}
 for(const [group,ids] of groups){
  const rs={id:group};const scoped=scopeDataSpec(data,ids),saved=await storeData(db,actor,scoped),child=id('dataset');
  const tids=r.template_ids.filter((tid:string)=>required.get(tid)?.every(id=>ids.includes(id)));
  const label=({budget:'预算对比',trend:'月度趋势',bridge:'收入归因',composition:'构成分析',scatter:'散点分析',combo:'组合分析',area:'面积趋势'} as Record<string,string>)[rs.id]??rs.id;
  const name=`${r.name} · ${label}`.slice(0,200),fingerprint=r.origin.kind==='biStudio'?hash(omit(scopeDataSpec(upstreamData,ids),['id','snapshot','extensions'])):null;
  await db.query('INSERT INTO app.datasets(id,owner_id,name,current_snapshot_id,origin,tags,template_ids,scope_result_set_ids,split_from_id,upstream_hash,sync_status,last_checked_at,last_synced_at,refresh_config) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[child,actor,name,saved.snapshot.id,r.origin,r.tags,tids,ids,r.id,fingerprint,r.sync_status,r.last_checked_at,r.last_synced_at,r.refresh_config?{...r.refresh_config,queries:r.refresh_config.queries.filter((q:any)=>ids.includes(q.resultSetId))}:null]);
  await db.query("INSERT INTO app.dataset_versions(dataset_id,version,name,snapshot_id,operation,tags,template_ids,refresh_config) VALUES($1,1,$2,$3,'split',$4,$5,$6)",[child,name,saved.snapshot.id,r.tags,tids,r.refresh_config?{...r.refresh_config,queries:r.refresh_config.queries.filter((q:any)=>ids.includes(q.resultSetId))}:null]);
  children.push({id:child,resultSetIds:ids,snapshotId:saved.snapshot.id});
 }
 const pages=(await db.query('SELECT id FROM app.slides WHERE dataset_id=$1 AND owner_id=$2 AND archived_at IS NULL ORDER BY id FOR UPDATE',[did,actor])).rows;
 let retained=false;
 for(const page of pages){
  const s=await getSlide(db,actor,page.id),ids=resultIds(s.bindings),target=ids.length?children.find(c=>ids.every(i=>c.resultSetIds.includes(i))):null;
  if(!target){retained=true;continue;}
  s.snapshotRef=target.snapshotId;s.revision++;s.reviewState={...s.reviewState,snapshotId:target.snapshotId};
  await db.query('UPDATE app.slides SET dataset_id=$2,current_revision=$3,updated_at=now() WHERE id=$1',[s.id,target.id,s.revision]);await insertRevision(db,actor,s);
 }
 // Unknown or deliberately composite templates retain their complete input.
 const retainedTemplates=r.template_ids.filter((tid:string)=>(required.get(tid)?.length??0)!==1);
 retained ||=retainedTemplates.length>0;
 if(retained&&retainedTemplates.length!==r.template_ids.length)await publish(db,actor,r,r.name,data,'split',undefined,{tags:r.tags,templateIds:retainedTemplates});
 await db.query('UPDATE app.datasets SET split_completed_at=now(),archived_at=CASE WHEN $2 THEN NULL ELSE now() END WHERE id=$1',[did,retained]);
 const result=[];for(const c of children)result.push(await getDataset(db,actor,c.id));return result;
}
export async function ensureScopedDatasets(pool:Pool,actor:number){
 await transaction(pool,async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`dataset-scopes:${actor}`]);
  const rows=(await db.query("SELECT d.id FROM app.datasets d JOIN app.data_snapshots s ON s.id=d.current_snapshot_id WHERE d.owner_id=$1 AND d.archived_at IS NULL AND d.split_completed_at IS NULL AND d.scope_result_set_ids IS NULL AND jsonb_array_length(s.payload->'resultSets')>1 ORDER BY d.id",[actor])).rows;
  for(const r of rows)await splitDataset(db,actor,r.id);
 });
}
export async function createSplitDatasets(db:DB,actor:number,input:any){
 const d=await createDataset(db,actor,input);
 const items=await splitDataset(db,actor,d.id);
 return {items};
}
