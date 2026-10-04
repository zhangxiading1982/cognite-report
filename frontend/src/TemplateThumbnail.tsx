import React,{useEffect,useRef,useState} from 'react';
import {renderSlideSvg} from '@slidebi/presentation';
import {post} from './api';
import './template-data.css';
/** Both thumbnails and full previews render the same compiled template sample. */
export async function loadTemplatePreview(templateId:string,body:any={}) {
 const result=await post(`/templates/${templateId}/preview`,body);
 if(result.compiled){
  if(!body.datasetId){const footers=new Set((result.slide?.elements||result.example?.slide?.elements||[]).filter((e:any)=>e.type==='sourceFooter').map((e:any)=>e.id));result.compiled.elements=result.compiled.elements.filter((e:any)=>e.id!=='draft-watermark'&&!footers.has(e.id));}
  const ids=[...new Set((result.slide?.elements||[]).filter((e:any)=>e.type==='image').map((e:any)=>e.assetId))] as string[];
  result.compiled.assets=await Promise.all(ids.map(async id=>{
   const response=await fetch(`/api/assets/${id}/file`);if(!response.ok)throw new Error('模板图片资源读取失败');
   const blob=await response.blob();const dataUri=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob)});
   return{id,dataUri};
  }));
 }
 return result;
}
export function TemplateThumbnail({templateId,name='模板'}:{templateId:string;name?:string}) {
 const ref=useRef<HTMLDivElement>(null);const[visible,V]=useState(false),[svg,S]=useState(''),[error,E]=useState('');
 useEffect(()=>{if(typeof IntersectionObserver==='undefined'){V(true);return}const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){V(true);observer.disconnect()}},{rootMargin:'120px'});if(ref.current)observer.observe(ref.current);return()=>observer.disconnect()},[]);
 useEffect(()=>{if(!visible)return;let active=true;S('');E('');loadTemplatePreview(templateId).then(r=>{if(active){if(!r.compiled||r.compatible===false)E('暂无可用样本预览');else S(renderSlideSvg(r.compiled))}}).catch(()=>{if(active)E('样本预览暂不可用')});return()=>{active=false}},[templateId,visible]);
 return <div ref={ref} className="template-thumbnail" role="img" aria-label={`${name}真实样本预览`}>{svg?<div dangerouslySetInnerHTML={{__html:svg}}/>:<span>{error||'正在加载样本预览…'}</span>}</div>
}
