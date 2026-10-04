import React,{useState} from 'react';
import {ChevronDown,ChevronRight,Folder,FolderInput,FolderOpen,Table2,Check,X} from 'lucide-react';
import './data-management.css';

export type DataDirectorySortMode='name'|'updatedDesc'|'updatedAsc';

type Props={
 activeId?:string;
 folders:any[];
 items:any[];
 selectedIds:string[];
 onSelection:(ids:string[])=>void;
 onOpen:(id:string)=>void;
 folderId:string|null;
 onFolderChange:(id:string|null)=>void;
 search:string;
 sortMode?:DataDirectorySortMode;
 onMove?:(datasetId:string,folderId:string|null)=>void|Promise<void>;
};

const byName=(a:any,b:any)=>String(a.name??'').localeCompare(String(b.name??''),'zh-CN',{numeric:true,sensitivity:'base'});
const timeValue=(item:any)=>{const value=Date.parse(item.updatedAt??item.updated_at??'');return Number.isFinite(value)?value:null};
const sorted=(items:any[],mode:DataDirectorySortMode)=>[...items].sort((a,b)=>{
 if(mode==='name')return byName(a,b);
 const left=timeValue(a),right=timeValue(b);
 if(left===null&&right!==null)return 1;
 if(left!==null&&right===null)return -1;
 if(left!==null&&right!==null&&left!==right)return mode==='updatedAsc'?left-right:right-left;
 return byName(a,b);
});
const formatTime=(value:any)=>{
 if(!value)return '';
 const date=new Date(value);
 if(Number.isNaN(date.valueOf()))return '';
 return date.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
};

export function DataDirectoryTree({activeId,folders,items,selectedIds,onSelection,onOpen,folderId,onFolderChange,search,sortMode='name',onMove}:Props){
 const [closed,C]=useState<Set<string>>(new Set());
 const [dragged,DR]=useState<string>();
 const [over,OV]=useState<string|null|undefined>();
 const [moveEditor,ME]=useState<string>();
 const [moveFolder,MF]=useState<string|null>(null);
 const [feedback,F]=useState('');
 const inScope=(id:string|null):boolean=>{let current=id;const seen=new Set();while(current){if(current===folderId)return true;if(seen.has(current))return false;seen.add(current);current=folders.find(f=>f.id===current)?.parentId??null}return folderId===null};
 const visible=sorted(items.filter(d=>!search||(inScope(d.folderId??null)&&d.name.toLowerCase().includes(search.toLowerCase()))),sortMode);
 const descendants=(parent:string|null):any[]=>{const all=new Set<string|null>([parent]);let changed=true;while(changed){changed=false;for(const f of folders)if(all.has(f.parentId??null)&&!all.has(f.id)){all.add(f.id);changed=true}}return visible.filter(d=>all.has(d.folderId??null)&&d.canEdit===true)};
 const toggleGroup=(parent:string|null,checked:boolean)=>{const ids=descendants(parent).map(d=>d.id);onSelection(checked?[...new Set([...selectedIds,...ids])]:selectedIds.filter(id=>!ids.includes(id)))};
 const move=(datasetId:string,targetId:string|null)=>{
  const item=items.find(candidate=>candidate.id===datasetId);
  if(!onMove||item?.canEdit!==true||((item.folderId??null)===targetId)){ME(undefined);return}
  const targetName=targetId===null?'根目录':folders.find(folder=>folder.id===targetId)?.name??'目标目录';
  try{
   const result=onMove(datasetId,targetId);
   F(`已将“${item.name}”移动到“${targetName}”`);
   Promise.resolve(result).catch(()=>F(`“${item.name}”移动失败，请重试`));
  }catch{F(`“${item.name}”移动失败，请重试`)}
  ME(undefined);DR(undefined);OV(undefined);
 };
 const dropProps=(targetId:string|null)=>({
  onDragOver:(event:React.DragEvent)=>{if(!onMove)return;event.preventDefault();event.dataTransfer.dropEffect='move';OV(targetId)},
  onDragLeave:()=>OV(current=>current===targetId?undefined:current),
  onDrop:(event:React.DragEvent)=>{event.preventDefault();const id=event.dataTransfer.getData('text/plain')||dragged;if(id)move(id,targetId)}
 });
 const branch=(parent:string|null,ancestors:string[]=[]):React.ReactNode=><ul role="group">{folders.filter(f=>(f.parentId??null)===parent&&!ancestors.includes(f.id)).map(f=>{const open=search||!closed.has(f.id),children=descendants(f.id);return <li key={f.id} role="treeitem" aria-expanded={!!open}><div className={`data-tree-row ${folderId===f.id?'active':''} ${over===f.id?'drop-target':''}`} {...dropProps(f.id)}><button className="tree-toggle" aria-label={`${open?'收起':'展开'}目录 ${f.name}`} onClick={()=>C(previous=>{const next=new Set(previous);if(open)next.add(f.id);else next.delete(f.id);return next})}>{open?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</button><input type="checkbox" aria-label={`选择目录内数据 ${f.name}`} disabled={!children.length} checked={!!children.length&&children.every(d=>selectedIds.includes(d.id))} ref={el=>{if(el)el.indeterminate=children.some(d=>selectedIds.includes(d.id))&&!children.every(d=>selectedIds.includes(d.id))}} onChange={e=>toggleGroup(f.id,e.target.checked)}/><button className="data-tree-label" aria-label={`打开目录 ${f.name}`} onClick={()=>onFolderChange(f.id)}>{open?<FolderOpen size={17}/>:<Folder size={17}/>}<span>{f.name}</span></button></div>{open&&branch(f.id,[...ancestors,f.id])}</li>})}{visible.filter(d=>(d.folderId??null)===parent).map(d=>{const canMove=!!onMove&&d.canEdit===true,stamp=d.updatedAt??d.updated_at;return <li key={d.id} role="treeitem" aria-selected={activeId===d.id} draggable={canMove} onDragStart={event=>{if(!canMove)return;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',d.id);DR(d.id);F(`正在移动“${d.name}”，请放到目标目录`);OV(undefined)}} onDragEnd={()=>{DR(undefined);OV(undefined)}}><div className={`data-tree-row data-leaf ${activeId===d.id?'active':''} ${dragged===d.id?'dragging':''}`}><span className="tree-spacer"/><input type="checkbox" aria-label={`选择 ${d.name}`} checked={selectedIds.includes(d.id)} disabled={d.canEdit!==true} title={d.canEdit!==true?'仅所有者可选择':d.canDelete===false?'已被引用；可以选择，删除时会保留并提示':`选择 ${d.name}`} onChange={e=>onSelection(e.target.checked?[...selectedIds,d.id]:selectedIds.filter(id=>id!==d.id))}/><button className="data-tree-label" aria-label={`预览 ${d.name}`} onClick={()=>onOpen(d.id)}><Table2 size={16}/><span className="data-tree-leaf-copy"><span>{d.name}</span>{formatTime(stamp)&&<time className="data-tree-updated" dateTime={stamp} title={`最新更新时间 ${formatTime(stamp)}`}>{formatTime(stamp)}</time>}</span></button>{canMove&&<button className="data-tree-move" type="button" title="移动到目录" aria-label={`移动 ${d.name}`} onClick={()=>{ME(d.id);MF(d.folderId??null)}}><FolderInput size={15}/></button>}</div>{moveEditor===d.id&&<div className="data-tree-move-editor"><label><span className="sr-only">选择目标目录</span><select aria-label={`选择“${d.name}”的目标目录`} value={moveFolder??''} onChange={event=>MF(event.target.value||null)}><option value="">/ 根目录</option>{folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button type="button" title="确认移动" aria-label={`确认移动 ${d.name}`} onClick={()=>move(d.id,moveFolder)}><Check size={15}/></button><button type="button" title="取消" aria-label={`取消移动 ${d.name}`} onClick={()=>ME(undefined)}><X size={15}/></button></div>}</li>})}</ul>;
 return <section className="data-directory-tree" aria-label="数据目录"><div className={`data-tree-row data-tree-root ${folderId===null?'active':''} ${over===null?'drop-target':''}`} {...dropProps(null)}><input type="checkbox" aria-label="选择全部可管理数据" disabled={!descendants(null).length} checked={!!descendants(null).length&&descendants(null).every(d=>selectedIds.includes(d.id))} onChange={e=>toggleGroup(null,e.target.checked)}/><button className="data-tree-label" onClick={()=>onFolderChange(null)}><FolderOpen size={18}/>全部数据</button></div><div role="tree" aria-label="数据文件目录">{branch(null)}</div>{!visible.length&&<p className="muted">{search?'当前目录范围没有匹配的数据':'暂无数据，请导入表格数据。'}</p>}<p className="sr-only" role="status" aria-live="polite">{feedback}</p></section>
}
