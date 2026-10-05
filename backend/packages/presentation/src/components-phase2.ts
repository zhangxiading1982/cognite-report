import type {SlideElement,Rect,CompiledElement} from './types';
import type {DataSpec} from './schema';
import {wrapText} from './layout';
export function compileComponent(e:SlideElement,rect:Rect,style:Record<string,any>,data:DataSpec,binding:any,fontFace:string):{elements:CompiledElement[];error?:string}{
 const fail=(error:string)=>({elements:[],error});
 const fs=style.fontSize??16;
 if(!Number.isFinite(fs)||fs<8||fs>80) return fail('组件字号范围8–80');
 const text=(id:string,r:Rect,value:string):CompiledElement=>({id,type:'text',rect:r,text:wrapText(value,r.w,fs).join('\n'),fontSize:fs,fontFace,color:style.color??'1F2937',bold:style.bold===true,italic:style.italic===true,align:style.align??'left',valign:'middle'});
 if(e.type==='table'){
  const rs=data.resultSets.find(r=>r.id===binding?.resultSetId);
  if(!rs||!Array.isArray(e.fields)||!e.fields.length||e.fields.length>8||new Set(e.fields).size!==e.fields.length||e.fields.some(f=>!rs.fields.some(x=>x.id===f)))return fail('请选择结果集及1–8个有效字段');
  if(!rs.rows.length||rs.rows.length>12)return fail('单页表格支持1–12行数据，请筛选数据或调整粒度');
  const fields=e.fields.map(f=>rs.fields.find(x=>x.id===f)!);
  const fieldName=(field:any)=>field.name??data.measures.find(item=>item.id===field.semanticRef)?.name??data.semanticSchema.tables.flatMap(table=>table.columns).find(column=>column.id===field.semanticRef)?.name??field.id;
  const rows=[fields.map(fieldName),...rs.rows.map(row=>fields.map(f=>row[f.id]===null?'—':String(row[f.id]??'')))];
  const rowHeight=rect.h/rows.length,colWidth=rect.w/fields.length;
  if(rows.some(row=>row.some(cell=>wrapText(cell,colWidth-12,fs).length*fs*1.25>rowHeight-8)))return fail('表格内容超出单元格，请扩大表格、减小字号或减少字段');
  return {elements:[{id:e.id,type:'table',rect,rows,fontFace,fontSize:fs,color:style.color??'1F2937',bold:style.bold===true,fill:style.fill??'EFF6FF',headerColor:style.headerColor??style.color??'1F2937',headerBold:style.headerBold!==false,bodyFill:style.bodyFill??'FFFFFF',bodyStripeFill:style.bodyStripeFill,borderMode:style.borderMode??'grid',line:{color:style.line?.color??'CBD5E1',width:style.line?.width??0.5}}]};
 }
 if(e.type==='process'){
  if(!Array.isArray(e.steps)||e.steps.length<2||e.steps.length>8||e.steps.some((x:any)=>typeof x!=='string'||!x.trim()||x.length>100))return fail('流程条需要2–8个非空步骤，每步最多100字');
  const gap=12,w=(rect.w-gap*(e.steps.length-1))/e.steps.length;
  return {elements:e.steps.flatMap((step:string,i:number)=>{
   const r={x:rect.x+i*(w+gap),y:rect.y,w,h:rect.h};
   return [{id:`${e.id}-box-${i}`,type:'shape',shape:'rect',rect:r,fill:style.fill??'DBEAFE'},text(`${e.id}-step-${i}`,{...r,x:r.x+8,w:r.w-16},`${i+1}. ${step}`)];
  })};
 }
 let value=e.value;
 const linked=!!e.bindingRef;
 if(linked){
  const rs=data.resultSets.find(r=>r.id===binding?.resultSetId),field=binding?.roles?.value;
  if(!rs||typeof field!=='string'||!rs.fields.some(f=>f.id===field&&['decimal','integer'].includes(f.type))||!e.rowKey||typeof e.rowKey!=='object')return fail('状态组件需数值字段与稳定行键');
  const entries=Object.entries(e.rowKey);
  if(!entries.length||entries.some(([key])=>!rs.fields.some(f=>f.id===key)))return fail('状态组件行键无效');
  const rows=rs.rows.filter(row=>entries.every(([key,v])=>row[key]===v));
  if(rows.length!==1||rows[0][field]===null)return fail('状态组件未匹配唯一非空数据行');
  value=Number(rows[0][field]);
 }
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)return fail('状态进度必须为0–1');
 if(typeof e.label!=='string'||!e.label.trim()||e.label.length>100)return fail('请填写状态名称（最多100字）');
 const bar={x:rect.x,y:rect.y+rect.h-16,w:rect.w,h:12};
 return {elements:[text(`${e.id}-label`,{...rect,h:rect.h-20},`${e.label} ${Math.round(value*100)}%${linked?'':'（人工）'}`),{id:`${e.id}-track`,type:'shape',shape:'rect',rect:bar,fill:'E2E8F0'},...(value>0?[{id:`${e.id}-value`,type:'shape' as const,shape:'rect' as const,rect:{...bar,w:bar.w*value},fill:style.fill??'2563EB'}]:[])]};
}
