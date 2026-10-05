import React from "react";
import { TemplateDataTable } from "./TemplateDataTable";

export function resolveTemplateElementData(slide:any,dataSpec:any,element:any){
  if(!element?.bindingRef)return undefined;
  const binding=slide?.bindings?.[element.bindingRef];
  if(!binding)return undefined;
  const resultIndex=dataSpec?.resultSets?.findIndex((result:any)=>result.id===binding.resultSetId)??-1;
  if(resultIndex<0)return undefined;
  return {binding,resultIndex,result:dataSpec.resultSets[resultIndex]};
}

function hierarchyDefaults(element:any,binding:any,result:any){
  if(element?.type!=="hierarchy")return {};
  const key=typeof binding.roles.key==="string"?binding.roles.key:undefined;
  const label=typeof binding.roles.label==="string"?binding.roles.label:undefined;
  const parent=typeof binding.roles.parent==="string"?binding.roles.parent:undefined;
  const subtitle=typeof binding.roles.subtitle==="string"?binding.roles.subtitle:undefined;
  if(!key||!label||!parent)return {};
  const root=result.rows.find((row:any)=>!row[parent])??result.rows[0];
  let sequence=result.rows.length+1,nodeId=`node-${sequence}`;
  const existing=new Set(result.rows.map((row:any)=>String(row[key])));
  while(existing.has(nodeId))nodeId=`node-${++sequence}`;
  return {[key]:nodeId,[label]:"新节点",[parent]:root?.[key]??"",...(subtitle?{[subtitle]:"待补充"}:{})};
}

export function TemplateElementDataPanel({slide,element,dataSpec,onChange}:{slide:any;element:any;dataSpec:any;onChange:(dataSpec:any)=>void}){
  const resolved=resolveTemplateElementData(slide,dataSpec,element);
  if(!resolved)return <div className="template-element-data-empty"><h3>模板数据</h3><p className="muted">当前对象没有可编辑的模板数据绑定。</p></div>;
  const {binding,result,resultIndex}=resolved;
  return <section className="template-element-data" aria-label="当前对象的模板数据">
    <h3>模板数据</h3>
    <p className="muted">修改后会立即更新当前模板页面。</p>
    <TemplateDataTable
      result={result}
      dataSpec={dataSpec}
      editable
      rowDefaults={hierarchyDefaults(element,binding,result)}
      onChange={nextResult=>{
        const next=structuredClone(dataSpec);
        next.resultSets[resultIndex]=nextResult;
        onChange(next);
      }}
    />
  </section>;
}
