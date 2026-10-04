import type {Pool} from 'pg';
import {compileSlide} from '@slidebi/presentation';
import {fixture,getData,transaction,hash} from './db.ts';
import {applyTemplate} from './template-application.ts';
import {scopeDataSpec} from './data-scope.ts';

export function captureTemplateExample(data:any,slide:any,businessContext?:any){
 const ids=[...new Set(Object.values(slide.bindings).map((b:any)=>b.resultSetId))] as string[];
 const dataSpec=scopeDataSpec(data,ids),exampleSlide=structuredClone(slide);
 delete dataSpec.extensions;delete exampleSlide.extensions;
 const fingerprint=hash({...dataSpec,id:undefined,snapshot:{...dataSpec.snapshot,id:undefined}}).slice(0,32);
 dataSpec.id=`template-example-data-${fingerprint}`;dataSpec.snapshot.id=`template-example-snapshot-${fingerprint}`;
 exampleSlide.id=`template-example-slide-${fingerprint}`;exampleSlide.snapshotRef=dataSpec.snapshot.id;exampleSlide.reviewState={...exampleSlide.reviewState,snapshotId:dataSpec.snapshot.id};
 return {identityVersion:1,slide:exampleSlide,dataSpec,businessContext:{background:businessContext?.background||'将关键业务指标与图表和结论放在同一页，辅助经营复盘与决策沟通。',scenarios:businessContext?.scenarios?.length?businessContext.scenarios:['经营复盘','指标分析与业务汇报']}};
}
function context(t:any){
 const kind=t.payload.chartType??t.payload.defaultElements?.find((e:any)=>e.type==='chart')?.chartType;
 if((t.scene==='budgetComparison'&&!kind)||['comparison','bar','groupedColumn'].includes(kind))return {background:'比较实际结果与预算目标，识别业务单元的完成差距，并说明重点偏差。',scenarios:['月度预算执行复盘','部门经营目标达成分析']};
 if(kind==='waterfall'||t.scene==='revenueBridge')return {background:'从期初到期末逐项展示增长与下降贡献，解释指标变化的业务原因。',scenarios:['收入变化归因','利润增减分析']};
 if(['pie','donut','percentStackedColumn','stackedColumn'].includes(kind))return {background:'展示不同业务类别对整体的贡献和结构差异，说明占比与规模的变化。',scenarios:['渠道与地区收入结构','产品组合分析']};
 if(kind==='scatter'||kind==='bubble')return {background:'同时比较两个指标的分布和关系，定位业务对象的优势、异常与改进机会。',scenarios:['业务组合对比','效率与规模分析']};
 return {background:'展示指标随时间的变化，结合文字说明趋势、波动及关键业务事件。',scenarios:['月度经营趋势复盘','收入与增长变化分析']};
}
/** Publish examples once as template-owned immutable payloads, never live dataset links. */
export async function ensureTemplateExamples(pool:Pool,actor:number){
 await transaction(pool,async db=>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('template-examples-v1',0))");
  const rows=(await db.query(`SELECT DISTINCT ON(t.id) v.*,t.visibility,t.owner_id FROM app.templates t JOIN app.template_versions v ON v.template_id=t.id WHERE (t.visibility='public' OR t.owner_id=$1) AND t.archived_at IS NULL ORDER BY t.id,v.version DESC`,[actor])).rows;
  for(const t of rows){
   if(t.payload.example?.identityVersion===1&&(t.visibility!=='builtin'||t.payload.example.designVersion===3))continue;
   let example:any;
   const candidates:any[]=t.payload.example?.dataSpec?[t.payload.example.dataSpec]:[];
   if(t.visibility!=='builtin'){
    // Older personal templates did not retain sourcePageId; match immutable snapshots by their saved bindings.
    const snapshots=(await db.query('SELECT id FROM app.data_snapshots WHERE owner_id=$1 ORDER BY created_at DESC,id',[actor])).rows;
    for(const row of snapshots)candidates.push(await getData(db,actor,row.id));
   }
   candidates.push(await fixture(),await fixture('phase2-charts.data'));
   for(const data of candidates){
    try{const s=t.visibility!=='builtin'&&t.payload.example?.slide?structuredClone(t.payload.example.slide):applyTemplate(data,t,{});if(t.visibility==='builtin'){const note=s.elements.find((e:any)=>e.type==='text'&&e.id.endsWith('-note')) as any;if(note)note.runs=[{text:context(t).background}];else {const chart=s.elements.find((e:any)=>e.type==='chart')!;chart.rect.h=310;s.elements.push({id:s.id+'-example-note',type:'text',rect:{x:40,y:430,w:880,h:45},z:4,style:{fontSize:14},runs:[{text:context(t).background}]});}}const scoped=captureTemplateExample(data,s,t.visibility==='builtin'?context(t):t.payload.example?.businessContext||context(t));if(compileSlide(scoped.slide,scoped.dataSpec,'draft').diagnostics.some(d=>d.severity==='error'))continue;example={...scoped,designVersion:3};break;}catch{/* Try the next immutable input compatible with this template. */}
   }
   if(!example)continue; // Missing legacy input is reported explicitly at preview time.
   const version=t.version+1;
   await db.query('INSERT INTO app.template_versions(template_id,version,name,scene,theme_id,theme_version,payload) VALUES($1,$2,$3,$4,$5,$6,$7)',[t.template_id,version,t.name,t.scene,t.theme_id,t.theme_version,{...t.payload,example}]);
   await db.query('INSERT INTO app.template_asset_refs(template_id,template_version,asset_id) SELECT template_id,$3,asset_id FROM app.template_asset_refs WHERE template_id=$1 AND template_version=$2',[t.template_id,t.version,version]);
  }
 });
}
