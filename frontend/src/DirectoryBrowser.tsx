import React,{useEffect,useState} from 'react';
import {Folder,FolderPlus,Trash2} from 'lucide-react';
import {api,post} from './api';
export function InlineName({name,canEdit,onSave}:{name:string;canEdit:boolean;onSave:(name:string)=>Promise<any>|void}){
 const [editing,E]=useState(false),[value,V]=useState(name),[error,X]=useState('');
 useEffect(()=>V(name),[name]);
 async function save(){if(!value.trim()){X('请输入名称');return}try{await onSave(value.trim());E(false);X('')}catch(e:any){X(e.message)}}
 return <>{editing?<input aria-label="修改名称" autoFocus value={value} onChange={e=>V(e.target.value)} onBlur={save} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){V(name);E(false)}}}/>:<span title={canEdit?'双击修改名称':undefined} onDoubleClick={()=>{if(canEdit)E(true)}}>{name}</span>}{error&&<small role="alert">{error}</small>}</>;
}
export function DirectoryBrowser({kind,value,onChange}:{kind:'data'|'assets'|'templates';value:string|null;onChange:(id:string|null)=>void}){
 const[items,I]=useState<any[]>([]),[adding,A]=useState(false),[name,N]=useState(''),[error,E]=useState(''),[remove,R]=useState<any>();
 const load=()=>api(`/folders?kind=${kind}`).then(r=>I(r.items||[])).catch(e=>E(e.message));useEffect(()=>{load()},[kind]);
 const current=items.find(f=>f.id===value),parents:any[]=[];let p=current;const seen=new Set();while(p&&!seen.has(p.id)){seen.add(p.id);parents.unshift(p);p=items.find(f=>f.id===p.parentId)}
 return <section className="directory-browser" aria-label="目录浏览"><div className="row"><button onClick={()=>onChange(null)}>全部目录 / 根目录</button>{parents.map(f=><button key={f.id} onClick={()=>onChange(f.id)}>{f.name}</button>)}<button title="新建目录" aria-label="新建目录" onClick={()=>A(!adding)}><FolderPlus size={18}/></button></div><div className="row">{items.filter(f=>(f.parentId??null)===value).map(f=><div className="row" key={f.id}><button aria-label={`打开目录 ${f.name}`} onClick={()=>onChange(f.id)}><Folder size={18}/></button><InlineName name={f.name} canEdit={f.canEdit!==false} onSave={async name=>{await api(`/folders/${f.id}`,{method:'PATCH',body:JSON.stringify({name})});await load()}}/>{f.canEdit!==false&&<button title="删除空目录" aria-label={`删除目录 ${f.name}`} onClick={()=>R(f)}><Trash2 size={15}/></button>}</div>)}</div>{adding&&<form className="row" onSubmit={async e=>{e.preventDefault();try{await post('/folders',{kind,name,parentId:value});A(false);N('');await load()}catch(e:any){E(e.message)}}}><input aria-label="目录名称" value={name} onChange={e=>N(e.target.value)}/><button disabled={!name.trim()}>创建目录</button></form>}{remove&&<div className="callout">确认删除目录“{remove.name}”？仅空目录可以删除。<button onClick={async()=>{try{await api(`/folders/${remove.id}`,{method:'DELETE'});R(undefined);await load()}catch(e:any){E(e.message)}}}>确认删除目录</button><button onClick={()=>R(undefined)}>取消</button></div>}{error&&<p role="alert">{error}</p>}</section>
}
export function ManagementFields({kind,item,onSaved}:{kind:'data'|'assets';item:any;onSaved:()=>void}){
 const[folders,F]=useState<any[]>([]),[error,E]=useState('');useEffect(()=>{api(`/folders?kind=${kind}`).then(r=>F(r.items||[])).catch(e=>E(e.message))},[kind]);
 async function patch(body:any){try{await api(`/management/${kind}/${item.id}`,{method:'PATCH',body:JSON.stringify(body)});onSaved()}catch(e:any){E(e.message)}}
 if(item.canEdit===false)return <p>{item.visibility==='public'?'公开':'私有'} · 仅所有者可修改</p>;
 return <div className="row"><label>可见性<select aria-label="可见性" value={item.visibility||'private'} onChange={e=>patch({visibility:e.target.value})}><option value="private">私有</option><option value="public">公开</option></select></label><label>目录<select aria-label="所属目录" value={item.folderId||''} onChange={e=>patch({folderId:e.target.value||null})}><option value="">根目录</option>{folders.filter(f=>f.canEdit!==false).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>{error&&<span role="alert">{error}</span>}</div>
}
