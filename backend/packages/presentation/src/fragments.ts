import type {SlideSpec,SlideElement,Binding} from './types';
import type {DataSpec} from './schema';
export interface Fragment {elements:SlideElement[];bindings:Record<string,Binding>;themeRef:SlideSpec['themeRef']}
export function makeFragment(slide:SlideSpec,ids:string[]):Fragment {
 if(!Array.isArray(ids)||!ids.length||ids.length>50||new Set(ids).size!==ids.length)throw Error('请选择有效对象');
 const elements=ids.map(id=>{const e=slide.elements.find(e=>e.id===id);if(!e)throw Error('所选对象不存在');const ov=slide.layoutOverrides[id];return {...structuredClone(e),rect:{...e.rect,...ov?.rect},style:{...e.style,...ov?.style}}});
 const bindings:Record<string,Binding>={};
 for(const e of elements){const refs=[e.bindingRef,...(e.runs??[]).map(r=>r.inlineValue?.bindingId)].filter(Boolean) as string[];for(const ref of refs){if(!slide.bindings[ref])throw Error('数据绑定不存在');bindings[ref]=structuredClone(slide.bindings[ref])}}
 return {elements,bindings,themeRef:structuredClone(slide.themeRef)};
}
export function insertFragment(slide:SlideSpec,fragment:Fragment,data:DataSpec,theme:'source'|'target'):SlideSpec {
 if(!fragment?.elements?.length||slide.elements.length+fragment.elements.length>50)throw Error('页面最多50个对象');
 const next=structuredClone(slide),prefix=crypto.randomUUID(),map:Record<string,string>={};
 for(const [key,b] of Object.entries(fragment.bindings)){
  const source=data.resultSets.find(r=>r.id===b.resultSetId);
  if(!source||Object.values(b.roles).flat().some(f=>!source.fields.some(x=>x.id===f)))throw Error('当前数据与片段字段不兼容，请使用匹配数据的页面');
  map[key]=`${prefix}-${key}`;next.bindings[map[key]]=structuredClone(b);
 }
 const left=Math.min(...fragment.elements.map(e=>e.rect.x)),top=Math.min(...fragment.elements.map(e=>e.rect.y));
 const maxZ=Math.max(0,...next.elements.map(e=>e.z));
 const offsetX=Math.min(24,960-Math.max(...fragment.elements.map(e=>e.rect.x+e.rect.w))),offsetY=Math.min(24,540-Math.max(...fragment.elements.map(e=>e.rect.y+e.rect.h)));
 for(const [i,original] of fragment.elements.entries()){
  const e=structuredClone(original);e.id=`${prefix}-${e.id}`;e.z=maxZ+i+1;
  e.rect.x=Math.max(0,left+offsetX)+(e.rect.x-left);e.rect.y=Math.max(0,top+offsetY)+(e.rect.y-top);
  if(e.groupId)e.groupId=`${prefix}-${e.groupId}`;
  if(e.bindingRef)e.bindingRef=map[e.bindingRef];
  for(const run of e.runs??[])if(run.inlineValue)run.inlineValue.bindingId=map[run.inlineValue.bindingId];
  e.style = {...e.style};
  if(theme==='source') e.style.themeId=e.style.themeId??fragment.themeRef.id;
  else delete e.style.themeId;
  next.elements.push(e);
 }
 return next;
}
