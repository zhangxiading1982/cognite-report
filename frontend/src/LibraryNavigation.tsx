import {DirectorySplit} from './DirectorySplit';
import React,{createContext,useContext,useEffect,useState,useCallback,useRef} from 'react';
import {ChevronRight,ChevronDown,Folder,FolderOpen,FolderCog} from 'lucide-react';
import {api} from './api';
import {Modal} from './ui';
import {DirectoryBrowser} from './DirectoryBrowser';
import './library-navigation.css';
type FolderKind='assets'|'templates'|'data';
type Kind=FolderKind|null;
type Navigation={kind:Kind;label:string;managed:boolean;folderId:string|null;setFolderId:(id:string|null)=>void;folders:any[];refresh:()=>Promise<void>};
const Context=createContext<Navigation>({kind:null,label:'资源库',managed:false,folderId:null,setFolderId:()=>{},folders:[],refresh:async()=>{}});
export const useLibraryNavigation=()=>useContext(Context);
export function LibraryNavigationProvider({kind,children}:{kind:Kind;children:React.ReactNode}){
 const [folderId,F]=useState<string|null>(null),[folders,S]=useState<any[]>([]),[error,E]=useState('');
 const generation=useRef(0);
 const refresh=useCallback(async()=>{const request=++generation.current;if(!kind){E('');return}try{const r=await api(`/folders?kind=${kind}`);if(request===generation.current){S(r.items||[]);E('')}}catch(e:any){if(request===generation.current)E(e.message)}},[kind]);
 useEffect(()=>{F(null);S([]);void refresh()},[refresh]);
 return <Context.Provider value={{kind,label:kind==='templates'?'模板库':kind==='data'?'数据管理':'资源库',managed:!!kind,folderId,setFolderId:F,folders,refresh}}>{children}{error&&<div className="library-nav-error" role="alert">{error}<button onClick={()=>refresh()}>重试目录</button></div>}</Context.Provider>;
}
export function LibraryTree(){
 const {kind,label,folderId,setFolderId,folders}=useLibraryNavigation(),[closed,C]=useState<Set<string>>(new Set());
 if(!kind)return null;
 const render=(parent:string|null,ancestors:string[]=[]):React.ReactNode=>folders.filter(f=>(f.parentId??null)===parent&&!ancestors.includes(f.id)).map(f=>{
  const children=folders.some(x=>x.parentId===f.id),open=!closed.has(f.id);
  return <li key={f.id}><div className={`library-tree-row ${folderId===f.id?'selected':''}`} style={{paddingLeft:8+ancestors.length*12}}>{children?<button className="tree-toggle" aria-label={`${open?'收起':'展开'}目录 ${f.name}`} aria-expanded={open} onClick={()=>C(old=>{const n=new Set(old);if(open)n.add(f.id);else n.delete(f.id);return n})}>{open?<ChevronDown size={13}/>:<ChevronRight size={13}/>}</button>:<span className="tree-spacer"/>}<button className="tree-select" aria-label={`目录 ${f.name}`} aria-current={folderId===f.id?'page':undefined} onClick={()=>setFolderId(f.id)}><Folder size={15}/><span>{f.name}</span></button></div>{children&&open&&<ul>{render(f.id,[...ancestors,f.id])}</ul>}</li>
 });
 return <section className="library-tree" aria-label={`${label}目录`}><button className={`tree-root ${folderId===null?'selected':''}`} aria-label="目录根路径 /" title="根目录" onClick={()=>setFolderId(null)}><FolderOpen size={15}/>/</button><ul>{render(null)}</ul></section>;
}
export function LibraryToolbar({actions,children}:{actions?:React.ReactNode;children?:React.ReactNode}){
 const n=useLibraryNavigation(),[manage,M]=useState(false);const ancestors:any[]=[],seen=new Set<string>();let node=n.folders.find(f=>f.id===n.folderId);
 while(node&&!seen.has(node.id)){seen.add(node.id);ancestors.unshift(node);node=n.folders.find(f=>f.id===node.parentId)}
 return <><div className="library-toolbar"><nav aria-label="当前位置" className="library-breadcrumb"><button aria-label={`返回${n.label}根目录`} onClick={()=>n.setFolderId(null)}>/</button>{ancestors.map((f,index)=><button key={f.id} aria-current={n.folderId===f.id?'page':undefined} onClick={()=>n.setFolderId(f.id)}>{index?'/':''}{f.name}</button>)}</nav><div className="library-toolbar-actions">{children}{actions}<button aria-label="管理目录" title="管理目录" onClick={()=>M(true)}><FolderCog size={18}/></button></div></div>{manage&&n.kind&&<FolderManager kind={n.kind} onClose={()=>{M(false);void n.refresh()}}/>}</>;
}

export function LibraryWorkspace({children}:{children:React.ReactNode}){
 const {kind}=useLibraryNavigation();
 return <DirectorySplit key={kind} storageKey={kind||'library'} directory={<LibraryTree/>}><div className="library-workspace-content">{children}</div></DirectorySplit>;
}
export function FolderManager({kind,onClose,onChanged}:{kind:FolderKind;onClose:()=>void;onChanged?:()=>void}){
 const [workingFolder,Select]=useState<string|null>(null);
 return <Modal title={`${kind==='templates'?'模板库':kind==='assets'?'资源库':'数据'}目录管理`} onClose={()=>{onChanged?.();onClose()}}><DirectoryBrowser kind={kind} value={workingFolder} onChange={Select}/></Modal>;
}
export function FolderPicker({kind,value,onChange,onClose}:{kind:FolderKind;value:string|null;onChange:(id:string|null)=>void;onClose:()=>void}){
 const [folders,F]=useState<any[]>([]),[error,E]=useState(''),[closed,C]=useState<Set<string>>(new Set());
 useEffect(()=>{let active=true;api(`/folders?kind=${kind}`).then(r=>{if(active)F(r.items||[])}).catch(e=>{if(active)E(e.message)});return()=>{active=false}},[kind]);
 const select=(id:string|null)=>{onChange(id);onClose()};
 const nodes=(parent:string|null,ancestors:string[]=[]):React.ReactNode=>folders.filter(f=>(f.parentId??null)===parent&&!ancestors.includes(f.id)).map(f=>{
  const hasChildren=folders.some(x=>x.parentId===f.id),expanded=!closed.has(f.id);
  return <li key={f.id}><div className="folder-picker-row">{hasChildren?<button aria-label={`${expanded?'收起':'展开'} ${f.name}`} aria-expanded={expanded} onClick={()=>C(old=>{const next=new Set(old);if(expanded)next.add(f.id);else next.delete(f.id);return next})}>{expanded?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</button>:<span className="tree-spacer"/>}<button aria-label={`选择目录 ${f.name}`} disabled={f.canEdit===false} aria-pressed={value===f.id} onClick={()=>select(f.id)}><Folder size={16}/>{f.name}</button></div>{hasChildren&&expanded&&<ul>{nodes(f.id,[...ancestors,f.id])}</ul>}</li>;
 });
 return <Modal title="选择目录" onClose={onClose}><div className="folder-picker"><button aria-pressed={value===null} onClick={()=>select(null)}><FolderOpen size={17}/>根目录</button><ul>{nodes(null)}</ul>{error&&<p role="alert">{error}</p>}</div></Modal>;
}
