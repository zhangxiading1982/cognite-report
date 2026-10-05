import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Decimal from 'decimal.js';
import {Type,Calculator,Calendar,ToggleLeft,KeyRound,Ruler,Info,X,Plus,Trash2} from 'lucide-react';
import {fieldLabel} from './ui';
import './template-data-table.css';
const numeric=(type:string)=>['decimal','integer','number'].includes(type);
const unitOptions=[['','无单位'],['CNY','人民币（¥）'],['USD','美元（$）'],['EUR','欧元（€）'],['%','百分比（0.12 → 12%）'],['元','元'],['万元','万元'],['亿元','亿元'],['个','个'],['人','人'],['次','次']];
export function formatFieldValue(value:any,field:any):string{
 if(value===null||value===undefined)return '—';
 if(!numeric(field.type)||(!field.displayFormat&&!field.unit))return String(value);
 try{let number=new Decimal(value);if(field.unit==='%')number=number.times(100);let text=field.displayFormat?.decimalPlaces===undefined?number.toFixed():number.toFixed(field.displayFormat.decimalPlaces);const parts=text.split('.');if(field.displayFormat?.useGrouping)parts[0]=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');text=parts.join('.');const prefix:Record<string,string>={CNY:'¥',USD:'$',EUR:'€'};return prefix[field.unit]?`${prefix[field.unit]}${text}`:`${text}${field.unit||''}`;}catch{return String(value)}
}
function nextPrimaryValue(result:any,field:any){
 const values=new Set(result.rows.map((row:any)=>String(row[field.id]??'')));
 if(field.type==='integer'){let value=Math.max(0,...result.rows.map((row:any)=>Number(row[field.id])).filter(Number.isSafeInteger))+1;while(values.has(String(value)))value++;return value}
 let index=result.rows.length+1,value=`row_${index}`;while(values.has(value))value=`row_${++index}`;return value;
}
export function createEditableRow(result:any,rowDefaults:Record<string,unknown>={}){
 const primary=new Set(result.primaryKey||[]);
 return Object.fromEntries(result.fields.map((field:any)=>{
  if(Object.prototype.hasOwnProperty.call(rowDefaults,field.id))return [field.id,rowDefaults[field.id]];
  if(primary.has(field.id))return [field.id,nextPrimaryValue(result,field)];
  if(field.nullable)return [field.id,null];
  if(field.type==='integer')return [field.id,0];
  if(field.type==='decimal'||field.type==='number')return [field.id,'0'];
  if(field.type==='boolean')return [field.id,false];
  if(field.type==='date')return [field.id,'2026-01-01'];
  if(field.type==='datetime')return [field.id,'2026-01-01T00:00:00.000Z'];
  return [field.id,''];
 }));
}
export function TemplateDataTable({result,dataSpec,editable=false,rowDefaults={},onChange}:{result:any;dataSpec?:any;editable?:boolean;rowDefaults?:Record<string,unknown>;onChange?:(result:any)=>void}){
 const [error,setError]=useState('');
 const [selected,S]=useState<number>(),[field,F]=useState<any>(),[primary,P]=useState(false),[position,positionSet]=useState({left:0,top:0}),[help,helpSet]=useState<{text:string;left:number;top:number}>();
 const popover=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement|null>(null);
 const close=()=>{S(undefined);trigger.current?.focus()};
 useEffect(()=>{if(!editable){S(undefined);helpSet(undefined)}},[editable]);
 useEffect(()=>{if(selected===undefined)return;const dismiss=(event:MouseEvent)=>{if(!popover.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))S(undefined)};document.addEventListener('mousedown',dismiss);popover.current?.querySelector<HTMLSelectElement>('select')?.focus();return()=>document.removeEventListener('mousedown',dismiss)},[selected]);
 const edit=(i:number,button:HTMLButtonElement)=>{const box=button.getBoundingClientRect();trigger.current=button;positionSet({left:Math.max(12,Math.min(box.left,window.innerWidth-352)),top:Math.max(12,Math.min(box.bottom+8,window.innerHeight-520))});helpSet(undefined);setError('');S(i);F({...result.fields[i],name:fieldLabel(dataSpec,result.fields[i])});P((result.primaryKey||[]).includes(result.fields[i].id))};
 const apply=()=>{
  if(!editable)return;
  const name=field.name?.trim();if(!name){setError('字段名称不能为空。');return}
  const next=structuredClone(result),changedType=result.fields[selected!].type!==field.type;
  next.fields[selected!]={...field,name};
  if(changedType){delete next.fields[selected!].semanticRef;next.rows=next.rows.map((row:any)=>{const value=row[field.id];return {...row,[field.id]:value===null?null:field.type==='integer'?Number(value):field.type==='boolean'?(value==='true'?true:value==='false'?false:value):String(value)}})}
  const invalid=next.rows.findIndex((row:any)=>{const value=row[field.id];if(value===null)return !field.nullable;if(field.type==='integer')return !Number.isSafeInteger(value);if(field.type==='decimal')return !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(value));if(field.type==='boolean')return typeof value!=='boolean';if(field.type==='date')return !/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value));if(field.type==='datetime')return Number.isNaN(Date.parse(value));return typeof value!=='string'});
  if(invalid>=0){setError(`第 ${invalid+1} 行的值不符合所选字段类型或空值设置，请先修正数据。`);return}
  next.primaryKey=(next.primaryKey||[]).filter((id:string)=>id!==field.id);if(primary)next.primaryKey.push(field.id);
  if(!next.primaryKey.length){setError('数据表至少需要一个主键字段。');return}
  onChange?.(next);close()
 };
 const showHelp=(f:any,target:HTMLElement)=>{if(!f.description)return;const box=target.getBoundingClientRect();helpSet({text:f.description,left:Math.max(8,Math.min(box.left,window.innerWidth-300)),top:box.bottom+6})};
 const displayName=(f:any)=>fieldLabel(dataSpec,f);
 return <section className="template-data-table"><div className="template-data-table-heading">{editable?<input key={`${result.id}:${result.name||''}`} className="data-table-name" aria-label="数据表名称" defaultValue={result.name||result.id} maxLength={80} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur()}} onBlur={event=>{const value=event.currentTarget.value.trim();if(value&&value!==(result.name||result.id))onChange?.({...structuredClone(result),name:value});else event.currentTarget.value=result.name||result.id}}/>:<h4>{result.name||result.id}</h4>}{editable&&<button type="button" className="template-data-row-add" aria-label="新增数据行" title="新增数据行" onClick={()=>{const next=structuredClone(result);next.rows.push(createEditableRow(result,rowDefaults));onChange?.(next)}}><Plus size={15}/>新增行</button>}</div><div className="table-scroll"><table><thead><tr>{result.fields.map((f:any,i:number)=>{const name=displayName(f),Icon=numeric(f.type)?Calculator:f.type==='boolean'?ToggleLeft:['date','datetime'].includes(f.type)?Calendar:Type;const typeLabel=numeric(f.type)?`数值类型 ${f.type}`:`类型 ${f.type}`;const label=<><Icon size={14} aria-label={typeLabel}/><span>{name}</span>{(result.primaryKey||[]).includes(f.id)&&<KeyRound size={13} aria-label="主键"/>}{f.unit&&<span title={`单位：${f.unit}`}><Ruler size={13}/>{f.unit}</span>}{f.description&&<Info size={13} aria-label="字段补充说明"/>}</>;return <th key={f.id}>{editable?<button className="field-heading" aria-label={`编辑字段 ${name}`} aria-haspopup="dialog" aria-expanded={selected===i} onMouseEnter={e=>showHelp(f,e.currentTarget)} onMouseLeave={()=>helpSet(undefined)} onFocus={e=>showHelp(f,e.currentTarget)} onBlur={()=>helpSet(undefined)} onClick={e=>edit(i,e.currentTarget)}>{label}</button>:<span className="field-heading" tabIndex={f.description?0:undefined} onMouseEnter={e=>showHelp(f,e.currentTarget)} onMouseLeave={()=>helpSet(undefined)} onFocus={e=>showHelp(f,e.currentTarget)} onBlur={()=>helpSet(undefined)}>{label}</span>}</th>})}{editable&&<th className="template-data-row-actions"><span className="sr-only">行操作</span></th>}</tr></thead><tbody>{result.rows.map((row:any,ri:number)=><tr key={ri}>{result.fields.map((f:any)=><td key={f.id}>{editable?<EditableCell value={row[f.id]} field={f} label={`${result.id} 第${ri+1}行 ${displayName(f)}`} onChange={value=>{const next=structuredClone(result);next.rows[ri][f.id]=value;onChange?.(next)}}/>:formatFieldValue(row[f.id],f)}</td>)}{editable&&<td className="template-data-row-actions"><button type="button" aria-label={`删除第 ${ri+1} 行`} title="删除该行" onClick={()=>{const next=structuredClone(result);next.rows.splice(ri,1);onChange?.(next)}}><Trash2 size={14}/></button></td>}</tr>)}</tbody></table></div>
 {help&&createPortal(<div role="tooltip" className="field-help-tooltip" style={{left:help.left,top:help.top}}>{help.text}</div>,document.body)}
 {editable&&selected!==undefined&&field&&createPortal(<div ref={popover} className="field-schema-popover" role="dialog" aria-label={`字段设置 ${field.name||field.id}`} style={position} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close()}if(e.key==='Tab'){e.stopPropagation();const controls=popover.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)');if(controls?.length){const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}}}>
 <div className="field-schema-popover-title"><strong>{field.name||field.id}</strong><button type="button" aria-label="关闭字段设置" onClick={close}><X size={16}/></button></div>
 <div className="field-schema-identity">字段标识：{field.id}</div>
 <label className="field">字段名称<input maxLength={200} value={field.name||''} onChange={e=>F({...field,name:e.target.value})}/></label>
 <label className="field">字段类型<select value={field.type} onChange={e=>{const next={...field,type:e.target.value};if(!numeric(next.type)){delete next.unit;delete next.displayFormat}F(next)}}>{[['string','文本'],['integer','整数'],['decimal','小数'],['boolean','布尔值'],['date','日期'],['datetime','日期时间']].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
 <div className="field-schema-checks"><label><input type="checkbox" checked={primary} onChange={e=>P(e.target.checked)}/>主键</label><label><input type="checkbox" checked={field.nullable} onChange={e=>F({...field,nullable:e.target.checked})}/>允许空值</label></div>
 <label className="field">字段单位<select disabled={!numeric(field.type)} value={field.unit||''} onChange={e=>F({...field,unit:e.target.value||undefined})}>{field.unit&&!unitOptions.some(([value])=>value===field.unit)&&<option value={field.unit}>{field.unit}</option>}{unitOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 {numeric(field.type)&&<div className="field-schema-number"><label><input type="checkbox" checked={field.displayFormat?.useGrouping??false} onChange={e=>F({...field,displayFormat:{...field.displayFormat,useGrouping:e.target.checked}})}/>千分位分隔</label><label className="field">小数位数<select value={field.displayFormat?.decimalPlaces??''} onChange={e=>F({...field,displayFormat:{...field.displayFormat,decimalPlaces:e.target.value===''?undefined:Number(e.target.value)}})}><option value="">自动</option>{[0,1,2,3,4,5,6,7,8,9,10,11,12].map(n=><option key={n} value={n}>{n} 位</option>)}</select></label></div>}
 <label className="field">字段说明<textarea rows={3} maxLength={1000} value={field.description||''} onChange={e=>F({...field,description:e.target.value})}/></label>
 <div role="alert" className="field-schema-error">{error}</div><div className="field-schema-actions"><button type="button" onClick={close}>取消</button><button type="button" onClick={apply}>应用字段设置</button></div>
 </div>,document.body)}</section>
}
function EditableCell({value,field,label,onChange}:{value:any;field:any;label:string;onChange:(value:any)=>void}){
 const [focused,setFocused]=useState(false),[buffer,setBuffer]=useState(''),[error,setError]=useState('');
 if(field.type==='boolean')return <select aria-label={label} value={value===null?'':String(value)} onChange={e=>onChange(e.target.value===''?null:e.target.value==='true')}>{field.nullable&&<option value="">空值</option>}<option value="true">true</option><option value="false">false</option></select>;
 const parse=(text:string)=>text===''?null:field.type==='integer'?Number(text):text;
 const valid=(text:string)=>text===''?field.nullable:field.type==='integer'?/^-?\d+$/.test(text)&&Number.isSafeInteger(Number(text)):field.type==='decimal'?/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text):true;
 return <><input aria-label={label} aria-invalid={!!error} title={error||undefined} value={focused?buffer:formatFieldValue(value,field)} onFocus={()=>{setBuffer(value===null?'':String(value??''));setFocused(true)}} onBlur={()=>{setFocused(false);if(!valid(buffer))setError('输入值不符合字段类型，已保留最后有效值。')}} onChange={e=>{const text=e.target.value;setBuffer(text);setError('');if(valid(text))onChange(parse(text))}}/>{error&&<span role="alert" className="field-schema-error">{error}</span>}</>;
}
