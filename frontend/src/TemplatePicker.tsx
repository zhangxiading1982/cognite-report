import React,{useEffect,useMemo,useState} from 'react';
import {ChevronDown,ChevronRight,Folder,FolderOpen,LayoutGrid,Search} from 'lucide-react';
import {api,type Template} from './api';
import {TemplateThumbnail} from './TemplateThumbnail';

const ALL='__all__';

export function TemplatePicker({templates,value,onChange}:{templates:Template[];value:string;onChange:(id:string)=>void}){
 const[folders,F]=useState<any[]>([]),[scope,S]=useState<string|null>(ALL),[search,Q]=useState(''),[closed,C]=useState<Set<string>>(new Set()),[error,E]=useState('');
 useEffect(()=>{let active=true;api('/folders?kind=templates').then(result=>{if(active)F(result.items||[])}).catch(reason=>{if(active)E(reason.message)});return()=>{active=false}},[]);
 const visible=useMemo(()=>{
  const query=search.trim().toLocaleLowerCase();
  return templates.filter(template=>(scope===ALL||((template.folderId??null)===scope))&&template.name.toLocaleLowerCase().includes(query));
 },[templates,scope,search]);
 useEffect(()=>{if(!visible.some(template=>template.id===value))onChange(visible[0]?.id||'')},[visible,value,onChange]);
 const nodes=(parent:string|null,ancestors:string[]=[]):React.ReactNode=>folders.filter(folder=>(folder.parentId??null)===parent&&!ancestors.includes(folder.id)).map(folder=>{
  const hasChildren=folders.some(item=>item.parentId===folder.id),open=!closed.has(folder.id);
  return <li key={folder.id}><div className={`template-picker-tree-row ${scope===folder.id?'selected':''}`}>{hasChildren?<button className="tree-toggle" aria-label={`${open?'收起':'展开'}目录 ${folder.name}`} aria-expanded={open} onClick={()=>C(current=>{const next=new Set(current);if(open)next.add(folder.id);else next.delete(folder.id);return next})}>{open?<ChevronDown size={13}/>:<ChevronRight size={13}/>}</button>:<span className="tree-spacer"/>}<button aria-label={`目录 ${folder.name}`} aria-current={scope===folder.id?'page':undefined} onClick={()=>S(folder.id)}><Folder size={15}/><span>{folder.name}</span></button></div>{hasChildren&&open&&<ul>{nodes(folder.id,[...ancestors,folder.id])}</ul>}</li>;
 });
 return <div className="template-picker">
  <nav className="template-picker-tree" aria-label="模板目录">
   <button className={scope===ALL?'selected':''} aria-label="全部模板" onClick={()=>S(ALL)}><LayoutGrid size={15}/>全部模板</button>
   <button className={scope===null?'selected':''} aria-label="模板根目录 /" onClick={()=>S(null)}><FolderOpen size={15}/>/</button>
   <ul>{nodes(null)}</ul>
  </nav>
  <section className="template-picker-results" aria-label="模板选择">
   <label className="search"><Search size={16}/><input aria-label="搜索模板名称" placeholder="模板名称" value={search} onChange={event=>Q(event.target.value)}/></label>
   {error&&<p role="alert" className="error">{error}</p>}
   <div className="add-page-templates">{visible.map(template=><button key={template.id} aria-label={`选择模板 ${template.name}`} aria-pressed={value===template.id} onClick={()=>onChange(template.id)}><TemplateThumbnail templateId={template.id} name={template.name}/><strong>{template.name}</strong></button>)}</div>
   {!visible.length&&<p className="empty">当前目录没有匹配的模板。</p>}
  </section>
 </div>;
}

