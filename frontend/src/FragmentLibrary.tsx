import React,{useEffect,useState} from 'react';
import {api,post} from './api';
export function FragmentLibrary({selected,flush,onInsert}:{selected:string[];flush:()=>Promise<any>;onInsert:(spec:any,theme:'source'|'target')=>void}){
 const [items,I]=useState<any[]>([]),[name,N]=useState(''),[tags,T]=useState(''),[search,Q]=useState(''),[error,E]=useState(''),[busy,B]=useState(false);
 async function load(){try{I((await api('/fragments')).items)}catch(e:any){E(e.message)}}useEffect(()=>{load()},[]);
 return <section><p>保存所选对象为个人片段，保留文字、样式与数据绑定，不复制业务数据。插入时使用目标页面当前数据；字段不匹配会提示。独立数据标注不随片段复制。</p>
 <label className="field">片段名称<input value={name} maxLength={200} onChange={e=>N(e.target.value)}/></label>
 <label className="field">片段标签<input value={tags} placeholder="逗号分隔" onChange={e=>T(e.target.value)}/></label>
 <button disabled={busy||!selected.length||!name.trim()} onClick={async()=>{B(true);E('');try{const s=await flush();await post('/fragments',{slideId:s.id,revision:s.revision,elementIds:selected,name:name.trim(),tags:tags.split(/[,，]/).map(t=>t.trim()).filter(Boolean)});N('');await load()}catch(e:any){E(e.message)}finally{B(false)}}}>保存所选为片段</button>
 <label className="field">搜索片段<input value={search} onChange={e=>Q(e.target.value)} /></label>
 {error&&<p className="error" role="alert">{error}</p>}
 <div className="list">{items.filter(f=>(f.name+' '+f.tags.join(' ')).includes(search)).map(f=><article key={f.id}><div><h3>{f.name}</h3><p>{f.tags.join(' / ')} · {f.spec.elements.length} 个对象</p></div><button aria-label={`使用当前主题插入 ${f.name}`} onClick={()=>{try{onInsert(f.spec,'target')}catch(e:any){E(e.message)}}}>使用当前主题插入</button><button aria-label={`保留来源主题插入 ${f.name}`} onClick={()=>{try{onInsert(f.spec,'source')}catch(e:any){E(e.message)}}}>保留来源主题</button><button disabled={busy} aria-label={`归档片段 ${f.name}`} onClick={async()=>{B(true);try{await post(`/fragments/${f.id}/archive`);await load()}catch(e:any){E(e.message)}finally{B(false)}}}>归档</button></article>)}</div>
 {!items.length&&<p>尚无个人片段。在画布中选择对象后保存，可在其他页面复用。</p>}
 </section>;
}
