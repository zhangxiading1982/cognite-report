import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {type DB,getData,getSlide,id,insertRevision,transaction} from './db.ts';
import {normalizeChartData} from './chart-data.ts';
import {saveRevision,getDeck} from './decks.ts';
import {ensureContents} from './contents.ts';
import {scopeDataSpec} from './data-scope.ts';
import {storeData} from './datasets.ts';
import {ensureTemplateExamples} from './template-examples.ts';
import {loadRuntimeConfig} from './config.ts';

type ResetSummary={
 pagesReset:number;
 documentsUpdated:number;
 multiTableDatasetsArchived:number;
 singleTableDatasetsSeeded:number;
};

type Example={templateId:string;templateVersion:number;templateName:string;chartType:string;dataSpec:any;binding:any};

async function templateExamples(db:DB,actor:number):Promise<Example[]> {
 const rows=(await db.query(`SELECT DISTINCT ON(t.id) t.id AS template_id,v.version,v.name,v.payload
  FROM app.templates t JOIN app.template_versions v ON v.template_id=t.id
  WHERE t.archived_at IS NULL AND (t.owner_id=$1 OR t.visibility='public') AND v.payload ? 'example'
  ORDER BY t.id,v.version DESC`,[actor])).rows;
 const examples:Example[]=[];
 for(const row of rows){
  const sample=row.payload.example;
  if(!sample?.slide||!sample?.dataSpec||sample.dataSpec.resultSets?.length!==1)continue;
  for(const chart of sample.slide.elements?.filter((element:any)=>element.type==='chart')??[]){
   const binding=sample.slide.bindings?.[chart.bindingRef];
   if(binding)examples.push({templateId:row.template_id,templateVersion:row.version,templateName:row.name,chartType:chart.chartType,dataSpec:sample.dataSpec,binding});
  }
 }
 return examples;
}

async function privateSource(db:DB,slide:any,base:any,chart:any,examples:Example[]){
 const preferred=examples.find(example=>example.templateId===slide.templateRef.id&&example.chartType===chart.chartType)
  ??examples.find(example=>example.chartType===chart.chartType)
  ??examples.find(example=>example.templateId===slide.templateRef.id);
 if(preferred)return {mode:'private',dataSpec:structuredClone(preferred.dataSpec),binding:structuredClone(preferred.binding)};
 const old=slide.extensions?.chartData?.[chart.id],binding=old?.binding??slide.bindings?.[chart.bindingRef];
 if(!binding)throw new Error(`页面 ${slide.id} 的图表 ${chart.id} 缺少字段绑定`);
 const source=old?.dataSpec??base;
 let dataSpec=source;
 try{dataSpec=scopeDataSpec(source,[binding.resultSetId])}catch{/* Retain the current chart input when an old composed ID cannot be projected. */}
 return {mode:'private',dataSpec:structuredClone(dataSpec),binding:structuredClone(binding)};
}

async function seedSingleTableDatasets(db:DB,actor:number,examples:Example[]){
 let seeded=0;
 const unique=new Map<string,Example>();
 for(const example of examples)if(!unique.has(example.templateId))unique.set(example.templateId,example);
 for(const example of unique.values()){
  const exists=await db.query("SELECT 1 FROM app.datasets WHERE owner_id=$1 AND archived_at IS NULL AND origin->>'review'='15' AND origin->>'templateId'=$2",[actor,example.templateId]);
  if(exists.rowCount)continue;
  const data=await storeData(db,actor,example.dataSpec),datasetId=id('dataset');
  const name=`${example.templateName} · 示例数据`.slice(0,200),origin={kind:'manual',importedAt:new Date().toISOString(),review:'15',source:'templateExample',templateId:example.templateId,templateVersion:example.templateVersion};
  await db.query(`INSERT INTO app.datasets(id,owner_id,name,current_snapshot_id,origin,tags,template_ids,scope_result_set_ids,visibility)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,'public')`,[datasetId,actor,name,data.snapshot.id,origin,{用途:['页面数据']},[example.templateId],data.resultSets.map((resultSet:any)=>resultSet.id)]);
  await db.query("INSERT INTO app.dataset_versions(dataset_id,version,name,snapshot_id,operation,tags,template_ids) VALUES($1,1,$2,$3,'import',$4,$5)",[datasetId,name,data.snapshot.id,{用途:['页面数据']},[example.templateId]]);
  seeded++;
 }
 return seeded;
}

/**
 * One-time Review 15 data normalization. It creates new page/deck revisions, so
 * layout history remains intact while current chart inputs become template-owned defaults.
 */
export async function resetReview15ContentData(pool:Pool,actor:number):Promise<ResetSummary>{
 await ensureTemplateExamples(pool,actor);
 await ensureContents(pool,actor);
 return transaction(pool,async db=>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`review15-data-reset:${actor}`]);
  const examples=await templateExamples(db,actor),affectedDecks=new Set<string>();
  const pages=(await db.query(`SELECT s.id,s.content_deck_id FROM app.slides s
   JOIN app.slide_revisions r ON r.slide_id=s.id AND r.revision=s.current_revision
   WHERE s.owner_id=$1 AND s.archived_at IS NULL AND s.content_deck_id IS NOT NULL
    AND COALESCE((r.payload->'extensions'->'review15DataReset'->>'version')::integer,0)<1
   ORDER BY s.id FOR UPDATE OF s`,[actor])).rows;
  for(const row of pages){
   let slide=await getSlide(db,actor,row.id);const base=await getData(db,actor,slide.snapshotRef),chartData:Record<string,any>={};
   for(const chart of slide.elements.filter((element:any)=>element.type==='chart')){
    const source=await privateSource(db,slide,base,chart,examples);chartData[chart.id]=source;slide.bindings[chart.bindingRef]=structuredClone(source.binding);
   }
   slide.extensions={...slide.extensions,chartData,review15DataReset:{version:1,resetAt:new Date().toISOString()}};
   delete slide.extensions.dataset;
   if(Object.keys(chartData).length){const normalized=await normalizeChartData(db,actor,slide,base);slide=normalized.slide;}
   slide.revision++;
   slide.reviewState={status:'needsReview',snapshotId:slide.snapshotRef};
   await db.query('UPDATE app.slides SET current_revision=$2,dataset_id=NULL,updated_at=now() WHERE id=$1',[slide.id,slide.revision]);
   await insertRevision(db,actor,slide);
   affectedDecks.add(row.content_deck_id);
  }
  for(const deckId of affectedDecks){
   const deck=await getDeck(db,actor,deckId),spec=structuredClone(deck.spec);spec.revision=deck.revision+1;
   for(const instance of spec.instances){const current=(await db.query('SELECT current_revision FROM app.slides WHERE id=$1 AND owner_id=$2',[instance.slideRef.id,actor])).rows[0];if(current)instance.slideRef.revision=current.current_revision;}
   await saveRevision(db,actor,spec);
   await db.query('UPDATE app.decks SET current_revision=$2,updated_at=now() WHERE id=$1',[deckId,spec.revision]);
  }
  const archived=await db.query(`UPDATE app.datasets d SET archived_at=now(),updated_at=now()
   FROM app.data_snapshots snapshot
   WHERE d.current_snapshot_id=snapshot.id AND d.owner_id=$1 AND d.archived_at IS NULL
    AND jsonb_typeof(snapshot.payload->'resultSets')='array' AND jsonb_array_length(snapshot.payload->'resultSets')>1`,[actor]);
  const seeded=await seedSingleTableDatasets(db,actor,examples);
  return {pagesReset:pages.length,documentsUpdated:affectedDecks.size,multiTableDatasetsArchived:archived.rowCount??0,singleTableDatasetsSeeded:seeded};
 });
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const pool=new Pool({connectionString:loadRuntimeConfig().databaseUrl});
 try{
  const actor=Number((await pool.query("SELECT id FROM app.users WHERE username='marx'")).rows[0]?.id);
  if(!actor)throw new Error('未找到管理员 marx');
  console.log(JSON.stringify(await resetReview15ContentData(pool,actor),null,2));
 }finally{await pool.end();}
}
