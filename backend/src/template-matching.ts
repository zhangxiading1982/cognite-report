import {compileSlide,PHASE2_TEMPLATES} from '@slidebi/presentation';
import {applyTemplate} from './template-application.ts';

const categoryRoles={
 categoryKey:{types:['string','date','datetime'],multiple:false},
 categoryLabel:{types:['string','date','datetime'],multiple:false},
};
const measureRole=(min=1,max=4)=>({types:['decimal','integer'],multiple:true,min,max,requiresMeasure:true});
function fallbackRoles(type:string){
 if(type==='line')return {...categoryRoles,categoryKey:{types:['date','datetime'],multiple:false},series:measureRole()};
 if(type==='waterfall')return {stepKey:{types:['string'],multiple:false},label:{types:['string'],multiple:false},role:{types:['string'],multiple:false},value:{types:['decimal','integer'],multiple:false,requiresMeasure:true},sort:{types:['integer','decimal'],multiple:false}};
 if(type==='scatter')return {...categoryRoles,x:{types:['decimal','integer'],multiple:false,requiresMeasure:true},y:{types:['decimal','integer'],multiple:false,requiresMeasure:true}};
 if(type==='combo')return {...categoryRoles,barSeries:measureRole(1,1),lineSeries:measureRole(1,1)};
 return {...categoryRoles,series:measureRole()};
}
function canConfigure(data:any,type:string,roles:Record<string,any>){
 return data.resultSets.some((rs:any)=>{
  const fields=rs.fields||[],measureIds=new Set((data.measures||[]).map((m:any)=>m.id));
  let numericNeeded=0;
  for(const rule of Object.values(roles) as any[]){
   const eligible=fields.filter((f:any)=>(!rule.types||rule.types.includes(f.type))&&(!rule.requiresMeasure||measureIds.has(f.semanticRef)));
   const required=rule.multiple?(rule.min??1):1;
   if(eligible.length<required)return false;
   if(rule.requiresMeasure)numericNeeded+=required;
  }
  const numeric=fields.filter((f:any)=>['decimal','integer'].includes(f.type)&&measureIds.has(f.semanticRef));
  if(numeric.length<numericNeeded)return false;
  if(type==='waterfall'){
   const roleField=fields.find((f:any)=>f.type==='string'&&(()=>{const values=new Set<string>((rs.rows||[]).map((row:any)=>String(row[f.id]).toLowerCase()));return values.has('start')&&values.has('total')&&[...values].every(value=>['start','delta','total'].includes(value))})());
   if(!roleField)return false;
  }
  return true;
 });
}

/** Automatic matching is limited to unambiguous roles; numeric axis/business roles are never guessed. */
export function matchTemplate(data:any,template:any):any {
 const inspect=(bindings?:any,matchedBy='chartHint')=>{
  const slide=applyTemplate(data,template,{bindings});
  const diagnostics=compileSlide(slide,data,'draft').diagnostics.filter(d=>d.code!=='NEEDS_REVIEW');
  return {status:diagnostics.some(d=>d.severity==='error')?'incompatible':'matched',bindings:slide.bindings,diagnostics,matchedBy};
 };
 try{return inspect();}catch{}
 const type=template.payload.chartType??template.payload.defaultElements?.find((e:any)=>e.type==='chart')?.chartType;
 const advanced=PHASE2_TEMPLATES.find(t=>t.chartType===type);
 const candidates:any[]=[];
 // A single series can be safely reused across these visualizations. Multiple
 // metrics/result sets need an explicit choice, even when their types match.
 if(advanced&&['stackedColumn','percentStackedColumn','pie','donut','area'].includes(type)){
  for(const rs of data.resultSets){
   if(rs.primaryKey.length!==1)continue;
   const key=rs.fields.find((f:any)=>f.id===rs.primaryKey[0]);
   if(!key||!(type==='area'?['date','datetime']:['string','date','datetime']).includes(key.type))continue;
   const measures=rs.fields.filter((f:any)=>['decimal','integer'].includes(f.type)&&data.measures.some((m:any)=>m.id===f.semanticRef));
   if(measures.length!==1)continue;
   const labels=rs.fields.filter((f:any)=>f.type==='string'&&f.id!==key.id);
   if(labels.length>1)continue;
   candidates.push({main:{resultSetId:rs.id,roles:{categoryKey:key.id,categoryLabel:labels[0]?.id??key.id,series:[measures[0].id]}}});
  }
 }
 if(candidates.length===1){try{return inspect(candidates[0],'schema');}catch{}}
 const roles=template.payload.bindingSchema?.main?.roles??advanced?.roles??fallbackRoles(type);
 const possible=canConfigure(data,type,roles);
 return {status:possible?'needsBinding':'incompatible',matchedBy:'none',diagnostics:[{severity:possible?'warning':'error',code:possible?'BINDING_REQUIRED':'MISSING_FIELDS',message:possible?'请明确选择结果集、分类和指标，避免自动推断业务含义':'缺少模板需要的分类、数值字段或指标口径'}]};
}
