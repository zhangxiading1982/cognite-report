import {DirectorySplit} from './DirectorySplit';
import {DataDirectoryTree,type DataDirectorySortMode} from './DataDirectoryTree';
import {FolderPicker,FolderManager} from './LibraryNavigation';
import {DatasetChartPreview} from './DatasetChartPreview';
import {TemplateDataTable} from './TemplateDataTable';
import {Copy,Trash2,LockKeyhole,Plus,FolderCog,Folder,Globe,Save,History,X,AlertTriangle,ArrowDownAZ,ClockArrowDown,ClockArrowUp,UserRound} from "lucide-react";
import {toDataSpec,tableSample} from "./table-import";
import {DirectoryBrowser,InlineName,ManagementFields} from "./DirectoryBrowser";
import {initialRoles,eligibleFields} from "./bindings";
import React, { useEffect, useState, useRef, useMemo } from "react";
import {loadTemplatePreview} from "./TemplateThumbnail";
import { compileSlide,renderSlideSvg } from "@slidebi/presentation";
import { api, post, Template } from "./api";
import { Modal, DataView, fieldLabel } from "./ui";
import { TagEditor, DataFields, tagText, Tags } from "./DataFields";
export const sourceLabel = (d: any) =>
  d?.origin?.kind === "biStudio"
    ? `BI Studio${d.origin?.transport === "mock" || d.origin?.connectionId === "mock" || d.origin?.upstream?.mock ? "（模拟）" : ""}`
    : d?.origin?.kind === "manual"
      ? "人工导入"
      : "历史导入 / 来源待确认";
const message = (e: any) =>
  e.status === 409 && !["DATASET_IN_USE", "DATASET_REFERENCED"].includes(e.detail?.code)
    ? "数据已更新，本地输入已保留。请重新打开当前数据后再保存。"
    : e.message;
export const syncLabel = (d: any) =>
  (
    ({
      current: "当前数据",
      synced: "已同步",
      edited: "人工订正",
      rolledBack: "已回滚",
      failed: "同步失败",
    }) as any
  )[d?.syncStatus] || "当前数据";
const stamp = (s: any) => (s ? new Date(s).toLocaleString("zh-CN") : "未知");
export function TemplatePreview({templateId,datasetId,onClose,onCreated,templates=[]}:any) {
 const [result,R]=useState<any>(),[error,E]=useState(''),[busy,B]=useState(false);
 useEffect(()=>{let active=true;B(true);R(undefined);E('');if(templateId)loadTemplatePreview(templateId).then(r=>{if(active)R(r)}).catch(e=>{if(active)E(message(e))}).finally(()=>{if(active)B(false)});return()=>{active=false}},[templateId]);
 const template=templates.find((t:any)=>t.id===templateId),context=result?.example?.businessContext||template?.example?.businessContext;
 if(!templateId&&datasetId)return <Modal title="图表数据预览" wide onClose={onClose}><MatchedDataPreview dataset={{id:datasetId}} templates={templates} onCreated={onCreated}/></Modal>;
 return <Modal title={template?.name||'模板预览'} wide onClose={onClose}>
  <section className="preview-first"><PreviewResult result={result} busy={busy} error={error}/></section>
  <section className="preview-information"><h3>业务背景与适用场景</h3><p>{context?.background||template?.description||'使用样例说明当前业务图表。'}</p>{context?.scenarios?.length>0&&<ul>{context.scenarios.map((scenario:string)=><li key={scenario}>{scenario}</li>)}</ul>}<h3>数据规范与样例</h3>{result?.dataSpec?.resultSets?.map((r:any)=><TemplateDataTable key={r.id} result={r} dataSpec={result.dataSpec}/>)}</section>
 </Modal>
}
function PreviewResult({result,busy,error}:any){let svg='';try{if(result?.compiled&&result.compatible!==false)svg=renderSlideSvg({...result.compiled,elements:result.compiled.elements.filter((element:any)=>element.id!=='draft-watermark')})}catch{}return <>{busy&&<p>正在生成当前数据效果…</p>}{error&&<p className="error" role="alert">{error}</p>}{result?.diagnostics?.map((d:any,i:number)=><p key={i} className={d.severity==='error'?'error':'callout'}>{d.message}</p>)}{svg&&<div className="actual-preview" dangerouslySetInnerHTML={{__html:svg}}/>}</>}
function TemplateContract({template,data}:any){
 const chartType=template?.chartType||(template?.defaultElements||template?.slide?.elements)?.find((e:any)=>e.type==='chart')?.chartType;
 const names:Record<string,string>={comparison:'簇状柱图',groupedColumn:'簇状柱图',bar:'柱图',line:'折线图',waterfall:'瀑布图',stackedColumn:'堆积柱图',percentStackedColumn:'百分比堆积柱图',pie:'饼图',donut:'圆环图',combo:'柱线组合图',area:'面积图',scatter:'散点图'};
 const legacy=template?.requiredBindings?.main;const resultSet=data?.resultSets?.find((r:any)=>r.id===legacy?.resultSetId);
 const labels:Record<string,string>={categoryKey:'分类唯一键',categoryLabel:'分类标签',series:'数值指标',stepKey:'步骤唯一键',label:'步骤标签',role:'步骤角色（start / delta / total）',value:'变化值',sort:'步骤顺序'};
 const legacyRoles=Object.fromEntries(Object.entries(legacy?.roles||{}).map(([key,value])=>{const ids=Array.isArray(value)?value:[value];return[key,{label:labels[key]||key,types:[...new Set(ids.map(id=>resultSet?.fields?.find((f:any)=>f.id===id)?.type).filter(Boolean))],multiple:Array.isArray(value),min:ids.length,max:ids.length,requiresMeasure:['series','value'].includes(key)}]}));
 const roles=template?.bindingSchema?.main?.roles||template?.requiredBindings?.main?.roleConstraints||legacyRoles;
 return <><p>图表类型：{names[chartType]||chartType||'按模板定义'}</p><p>{template?.description||'按结果集的字段类型和展示角色匹配模板；含多种含义的字段需要明确绑定。'}</p><div className="table-scroll"><table><thead><tr><th>展示角色</th><th>字段类型</th><th>数量与口径</th></tr></thead><tbody>{Object.entries(roles).map(([key,r]:any)=><tr key={key}><td>{r.label||key}</td><td>{r.types?.join(' / ')||r.type||'按绑定定义'}</td><td>{r.multiple?`${r.min||1}–${r.max||'多'} 项`:'1 项'}{r.requiresMeasure?'；关联指标口径和单位':''}</td></tr>)}</tbody></table></div>
 <ul><li>数值字段应提供指标口径与单位；同一坐标轴使用一致单位，双轴组合图可分别设置单位。</li><li>分类键需唯一且完整；缺失值不会自动当作零，具体缺失或绑定问题会在预览中提示。</li>{['pie','donut','percentStackedColumn'].includes(chartType)&&<li>份额指标必须可加、非负且合计大于零。{['pie','donut'].includes(chartType)?'最多 12 个分类。':''}</li>}{chartType==='area'&&<li>面积图分类轴使用 date / datetime 字段。</li>}{['stackedColumn','percentStackedColumn','pie','donut','combo','area','scatter'].includes(chartType)&&<li>每张图最多 200 行；所选指标不允许缺失值。</li>}</ul></>
}
export function MatchedDataPreview({dataset,templates}:any){
 const [matches,M]=useState<any[]>([]),[tid,T]=useState(''),[error,E]=useState(''),[bindings,Bindings]=useState<any>();
 useEffect(()=>{let active=true;M([]);T('');E('');Bindings(undefined);api(`/datasets/${dataset.id}/templates`).then(r=>{if(active){const items=r.items||[];M(items);T(items.find((m:any)=>m.status==='matched')?.templateId||items.find((m:any)=>m.status==='needsBinding')?.templateId||'')}}).catch(e=>{if(active)E(e.message)});return()=>{active=false}},[dataset.id,dataset.version]);
 const match=matches.find(m=>m.templateId===tid),template=templates.find((t:any)=>t.id===tid),data=dataset.dataSpec;
 const activeBinding=bindings||match?.bindings;
 const schema=match?.bindingSchema?.main?.roles||template?.bindingSchema?.main?.roles||legacyRoleSchema(activeBinding?.main?.roles)||chartRoleSchema(match?.chartType);
 const issue=chartBindingIssue(data,schema,activeBinding,match);
 const result=useMemo(()=>chartPreviewResult(data,match,activeBinding,issue),[data,match,activeBinding,issue]);
 const chartNames:Record<string,string>={comparison:'簇状柱图',groupedColumn:'簇状柱图',bar:'条形图',line:'折线图',waterfall:'瀑布图',stackedColumn:'堆积柱图',percentStackedColumn:'百分比堆积柱图',pie:'饼图',donut:'圆环图',combo:'柱线组合图',area:'面积图',scatter:'散点图'};
 const groups=[['比较',['comparison','groupedColumn','bar','stackedColumn','percentStackedColumn']],['趋势',['line','area']],['构成',['pie','donut']],['变化',['waterfall']],['关系',['combo','scatter']]] as const;
 const uncategorized=matches.filter(m=>!groups.some(([,types])=>(types as readonly string[]).includes(m.chartType)));
 const option=(m:any)=><option className={m.status==='incompatible'?'chart-option-unavailable':m.status==='needsBinding'?'chart-option-configurable':''} disabled={m.status==='incompatible'} key={m.templateId} value={m.templateId}>{chartNames[m.chartType]||m.name}{m.status==='incompatible'?' · 当前数据不可用':m.status==='needsBinding'?' · 需要配置字段':''}</option>;
 return <section className="matched-data-preview">{matches.length?<><div className="chart-preview-controls"><label className="field chart-type-picker">适合的图表类型<select value={tid} onChange={e=>{T(e.target.value);Bindings(undefined)}}><option value="">选择图表类型</option>{groups.map(([label,types])=>{const options=matches.filter(m=>(types as readonly string[]).includes(m.chartType));return options.length?<optgroup key={label} label={label}>{options.map(option)}</optgroup>:null})}{uncategorized.length>0&&<optgroup label="其他">{uncategorized.map(option)}</optgroup>}</select></label>{tid&&data&&match?.status!=='incompatible'&&<RoleBindings key={`${tid}-${dataset.version||''}`} data={data} scene={match?.scene||template?.scene} schema={schema} initial={match?.bindings} onChange={Bindings}/>}</div><div className="chart-preview-stage">{tid&&issue&&<div className="chart-preview-unavailable" role="status"><AlertTriangle size={20}/><div><strong>{chartNames[match?.chartType]||match?.name||'所选图表'}还不能预览</strong><p>{issue}</p></div></div>}{!issue&&<PreviewResult result={result} busy={false} error={error}/>}</div></>:<p>{error||'当前没有可选择的图表类型。'}</p>}</section>
}

function chartPreviewResult(data:any,match:any,binding:any,issue:string){
 if(!data||!match||!binding?.main||issue)return undefined;
 const chartType=match.chartType==='bar'?'comparison':match.chartType;
 const snapshotId=data.snapshot?.id||'chart-preview-snapshot';
 const slide:any={specVersion:'1.0',id:'data-chart-preview',revision:1,title:'',scene:match.scene||(['line','area','combo'].includes(chartType)?'monthlyTrend':chartType==='waterfall'?'revenueBridge':'budgetComparison'),templateRef:{id:match.templateId,version:1},themeRef:{id:'corporate-blue',version:1},canvas:{width:960,height:540,unit:'pt'},snapshotRef:snapshotId,bindings:{main:{...structuredClone(binding.main),computations:binding.main.computations||[]}},elements:[{id:'data-chart-preview-chart',type:'chart',rect:{x:40,y:30,w:880,h:470},z:1,bindingRef:'main',chartType,options:{showLegend:true,showLabels:true,...(chartType==='combo'?{secondaryAxis:true}:{})},exportPolicy:chartType==='waterfall'?'nativeShapes':'nativeChart'}],annotations:[],layoutOverrides:{},reviewState:{status:'notRequired',snapshotId}};
 const compiled=compileSlide(slide,data,'draft');
 const diagnostics=compiled.diagnostics.filter((diagnostic:any)=>diagnostic.code!=='NEEDS_REVIEW');
 return {compiled:{...compiled,diagnostics,elements:compiled.elements.filter((element:any)=>element.id!=='draft-watermark')},diagnostics,compatible:!diagnostics.some((diagnostic:any)=>diagnostic.severity==='error')};
}

const legacyRoleRules:Record<string,any>={
 categoryKey:{label:'分类唯一键',types:['string','date','datetime'],multiple:false},
 categoryLabel:{label:'分类标签',types:['string','date','datetime'],multiple:false},
 series:{label:'数值指标',types:['decimal','integer'],multiple:true,min:1,max:4,requiresMeasure:true},
 stepKey:{label:'步骤唯一键',types:['string','date','datetime'],multiple:false},
 label:{label:'步骤标签',types:['string','date','datetime'],multiple:false},
 role:{label:'步骤角色',types:['string'],multiple:false},
 value:{label:'变化值',types:['decimal','integer'],multiple:false,requiresMeasure:true},
 sort:{label:'步骤顺序',types:['integer','decimal'],multiple:false},
 x:{label:'X 轴指标',types:['decimal','integer'],multiple:false,requiresMeasure:true},
 y:{label:'Y 轴指标',types:['decimal','integer'],multiple:false,requiresMeasure:true},
 barSeries:{label:'柱指标',types:['decimal','integer'],multiple:true,min:1,max:1,requiresMeasure:true},
 lineSeries:{label:'线指标',types:['decimal','integer'],multiple:true,min:1,max:1,requiresMeasure:true},
};
function legacyRoleSchema(roles:any){
 if(!roles)return undefined;
 return Object.fromEntries(Object.entries(roles).map(([key,value])=>[key,legacyRoleRules[key]||{label:key,multiple:Array.isArray(value)}]));
}
function chartRoleSchema(chartType:string){
 const categoryKey=chartType==='line'||chartType==='area'?{...legacyRoleRules.categoryKey,label:'日期',types:['date','datetime']} : legacyRoleRules.categoryKey;
 const base={categoryKey,categoryLabel:legacyRoleRules.categoryLabel};
 if(chartType==='waterfall')return {stepKey:legacyRoleRules.stepKey,label:legacyRoleRules.label,role:legacyRoleRules.role,value:legacyRoleRules.value,sort:legacyRoleRules.sort};
 if(chartType==='scatter')return {...base,x:legacyRoleRules.x,y:legacyRoleRules.y};
 if(chartType==='combo')return {...base,barSeries:legacyRoleRules.barSeries,lineSeries:legacyRoleRules.lineSeries};
 return {...base,series:{...legacyRoleRules.series,max:['pie','donut'].includes(chartType)?1:4}};
}

function chartBindingIssue(data:any,schema:any,binding:any,match:any){
 if(!data||!schema)return match?.status==='incompatible'?(match.diagnostics?.[0]?.message||'当前数据缺少该图表需要的字段。'):'';
 const sets=data.resultSets||[],numericNeeded=Object.values(schema as Record<string,any>).reduce((sum:number,rule:any)=>sum+(rule.requiresMeasure?(rule.multiple?rule.min??1:1):0),0);
 const mostNumeric=Math.max(0,...sets.map((rs:any)=>eligibleFields(rs,{types:['decimal','integer'],requiresMeasure:true},data).length));
 if(numericNeeded>mostNumeric)return `当前数据表至少还需要 ${numericNeeded-mostNumeric} 个数值字段，才能完成图表配置。`;
 if(!binding?.main)return match?.status==='incompatible'?(match.diagnostics?.[0]?.message||'当前数据缺少该图表需要的字段。'):'请选择数据表和图表字段。';
 const rs=sets.find((r:any)=>r.id===binding.main.resultSetId);if(!rs)return '请选择有效的数据表。';
 const selected:string[]=[];
 for(const [key,rule] of Object.entries(schema as Record<string,any>)){
  const raw=binding.main.roles?.[key],values=(Array.isArray(raw)?raw:[raw]).filter(Boolean),needed=rule.multiple?rule.min??1:1;
  if(values.length<needed)return `请为“${rule.label||key}”选择${needed>1?`至少 ${needed} 个`:'一个'}字段。`;
  const allowed=new Set(eligibleFields(rs,rule,data).map((f:any)=>f.id));const invalid=values.find((id:string)=>!allowed.has(id));if(invalid){const field=rs.fields.find((f:any)=>f.id===invalid);if(rule.requiresMeasure&&field&&!data.measures?.some((measure:any)=>measure.id===field.semanticRef))return `“${fieldLabel(data,field)}”不是指标字段，不能用于“${rule.label||key}”。请选择具有计算口径和单位的指标字段。`;return `“${rule.label||key}”包含不适用的字段，请重新选择。`}
  if(rule.requiresMeasure)selected.push(...values);
 }
 if(new Set(selected).size!==selected.length)return '不同数值轴需要选择不同字段。';
 if(['pie','donut'].includes(match?.chartType)){
  const fieldId=Array.isArray(binding.main.roles?.series)?binding.main.roles.series[0]:undefined,field=rs.fields.find((item:any)=>item.id===fieldId),values=(rs.rows||[]).map((row:any)=>row[fieldId]);
  const negatives=values.filter((value:any)=>value!=null&&Number(value)<0).length;if(negatives)return `“${field?fieldLabel(data,field):'份额指标'}”包含 ${negatives} 个负值，${match.chartType==='pie'?'饼图':'圆环图'}的份额指标不允许负值。`;
  if(values.length&&values.reduce((sum:number,value:any)=>sum+Number(value||0),0)<=0)return `${match.chartType==='pie'?'饼图':'圆环图'}的份额指标合计必须大于零。`;
  const measure=data.measures?.find((item:any)=>item.id===field?.semanticRef);if(measure&&measure.aggregationBehavior!=='additive')return `“${fieldLabel(data,field)}”不是可加指标，不能用于${match.chartType==='pie'?'饼图':'圆环图'}份额。请选择可汇总的非负指标。`;
 }
 return '';
}
export function DataManagement({templates,onCreated,registerLeave,initialDatasetId}:{templates:Template[];onCreated:(s:any)=>void;registerLeave?:(fn:()=>Promise<void>)=>void;initialDatasetId?:string}) {
 const [items,I]=useState<any[]>([]),[folders,Folders]=useState<any[]>([]),[selected,S]=useState<any>(),[name,N]=useState(''),[raw,R]=useState(''),[tags,TagsState]=useState<Tags>({用途:['页面数据']}),[refreshConfig,RefreshConfig]=useState<any>({mode:'manual',queries:[]}),[dirty,D]=useState(false),[error,E]=useState(''),[notice,Notice]=useState(''),[busy,B]=useState(false),[folderId,FolderId]=useState<string|null>(null),[search,Q]=useState(''),[sortMode,SortMode]=useState<DataDirectorySortMode>('name'),[checked,Checked]=useState<string[]>([]),[bulkConfirm,BulkConfirm]=useState(false),[manage,Manage]=useState(false),[picker,Picker]=useState(false),[adding,A]=useState(false),[kind,K]=useState('manual'),[chart,C]=useState('chart-demo-budget'),[versions,V]=useState<any[]>(),[historical,H]=useState<any>(),[restore,Restore]=useState<any>(),[deleting,Delete]=useState(false),[closeConfirm,CloseConfirm]=useState(false),[loading,Loading]=useState(false);
 const request=useRef(0),pending=useRef<{resolve:()=>void;reject:(e:any)=>void}|undefined>(undefined);
 const cancelError=()=>Object.assign(new Error(''),{code:'NAVIGATION_CANCELLED'});
 async function guard(){if(busy)throw cancelError();if(!dirty)return; if(pending.current)throw cancelError();return new Promise<void>((resolve,reject)=>{pending.current={resolve,reject};CloseConfirm(true)})}
 function decide(proceed:boolean){const next=pending.current;pending.current=undefined;CloseConfirm(false);if(proceed){D(false);next?.resolve()}else next?.reject(cancelError())}
 function navigate(action:()=>void|Promise<void>){void guard().then(action).catch(e=>{if(e.code!=='NAVIGATION_CANCELLED')E(message(e))})}
 useEffect(()=>{registerLeave?.(guard);return()=>{registerLeave?.(async()=>{})}},[registerLeave,dirty,busy]);
 useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before)},[dirty]);
 useEffect(()=>()=>{request.current++;pending.current?.reject(cancelError())},[]);
 const list=async()=>{try{const [data,dirs]=await Promise.all([api('/datasets'),api('/folders?kind=data')]);I(data.items||[]);Folders(dirs.items||[])}catch(e:any){E(message(e))}};
 useEffect(()=>{void list();if(initialDatasetId)void open(initialDatasetId)},[initialDatasetId]);
 async function open(id:string){const seq=++request.current;Loading(true);E('');try{const d=await api(`/datasets/${id}`);if(seq!==request.current)return;A(false);S(d);N(d.name);R(JSON.stringify(d.dataSpec));TagsState(d.tags||{});RefreshConfig(d.refreshConfig||{mode:'manual',queries:[]});D(false);V(undefined);H(undefined);Delete(false);Restore(undefined)}catch(e:any){if(seq===request.current)E(message(e))}finally{if(seq===request.current)Loading(false)}}
 function close(){request.current++;Loading(false);S(undefined);A(false);D(false);CloseConfirm(false);E('')}
 const data=(()=>{try{return JSON.parse(raw)}catch{return null}})();
 const editable=selected?.canEdit===true&&!loading;
 async function save(){if(adding&&kind==='bi')return importBi();B(true);E('');try{const spec=selected?data:toDataSpec(JSON.parse(raw));if(!spec)throw new Error('请填写有效的数据');if(selected&&JSON.stringify(spec.source)!==JSON.stringify(selected.dataSpec.source))throw new Error('source 来源信息只读，不能修改。');const split=!selected&&spec.resultSets?.length>1;const result=await api(selected?`/datasets/${selected.id}`:split?'/datasets/split-import':'/datasets',{method:selected?'PUT':'POST',headers:selected?{'If-Match':String(selected.version)}:{},body:JSON.stringify({name,dataSpec:spec,tags,refreshConfig,...(!selected?{preserveResultSets:false}:{})})});if(!selected&&folderId)for(const entry of result.items||[result])await api(`/management/data/${entry.id}`,{method:'PATCH',body:JSON.stringify({folderId})});A(false);D(false);if(split){S(undefined);Notice(`已拆分为 ${result.items.length} 份单表数据，可分别维护。`)}else await open(result.id);await list();return true}catch(e:any){E(message(e));return false}finally{B(false)}}
 async function importBi(){B(true);try{const d=await post('/datasets/bi-import',{name:name||undefined,chartId:chart,splitInputs:true,preserveResultSets:false,tags});if(folderId)for(const entry of d.items||[d])await api(`/management/data/${entry.id}`,{method:'PATCH',body:JSON.stringify({folderId})});A(false);D(false);if(d.items?.length>1){S(undefined);Notice(`已拆分为 ${d.items.length} 份单表数据，可分别维护。`)}else await open(d.id);await list();return true}catch(e:any){E(message(e));return false}finally{B(false)}}
 async function metadata(patch:any){B(true);try{await api(`/management/data/${selected.id}`,{method:'PATCH',body:JSON.stringify(patch)});S({...selected,...patch});await list();Picker(false)}catch(e:any){E(message(e))}finally{B(false)}}
 async function moveDataset(datasetId:string,targetFolderId:string|null){const item=items.find(x=>x.id===datasetId);if(item?.canEdit!==true)return;E('');try{await api(`/management/data/${datasetId}`,{method:'PATCH',body:JSON.stringify({folderId:targetFolderId})});if(selected?.id===datasetId)S({...selected,folderId:targetFolderId});await list();Notice(`已将“${item.name}”移动到${targetFolderId?'所选目录':'根目录'}。`)}catch(e:any){E(message(e));throw e}}
 async function copyDataId(){if(!selected?.dataId)return;try{await navigator.clipboard.writeText(selected.dataId)}catch{E('复制失败，请重试。')}}
 async function remove(ids:string[]){B(true);E('');const failed:string[]=[],messages:string[]=[];let count=0;for(const id of ids){const d=items.find(x=>x.id===id)||selected;try{await api(`/datasets/${id}`,{method:'DELETE',headers:{'If-Match':String(d.version)}});count++;if(selected?.id===id)S(undefined)}catch(e:any){failed.push(id);messages.push(`${d.name}：${message(e)}`)}}Checked(failed);Delete(false);BulkConfirm(false);await list();if(selected&&failed.includes(selected.id)){const fresh=await api(`/datasets/${selected.id}`);S(fresh)}Notice(count?`已删除 ${count} 份数据。`:'');E(messages.join('；'));B(false)}
 function add(){request.current++;Loading(false);S(undefined);A(true);N('');R('');K('manual');TagsState({用途:['页面数据']});RefreshConfig({mode:'manual',queries:[]});D(false);E('')}
 const path=(id:string|null)=>{const names:string[]=[],seen=new Set();while(id&&!seen.has(id)){seen.add(id);const f=folders.find(x=>x.id===id);if(!f)break;names.unshift(f.name);id=f.parentId}return names.length?`/${names.join('/')}`:'/'};
 const sortLabel:Record<DataDirectorySortMode,string>={name:'排序：名称升序',updatedDesc:'排序：更新时间降序',updatedAsc:'排序：更新时间升序'},SortIcon=sortMode==='name'?ArrowDownAZ:sortMode==='updatedDesc'?ClockArrowDown:ClockArrowUp;
 return <>
  <DirectorySplit storageKey="data" initialWidth={260} className="data-management-split" directory={<DataDirectoryTree folders={folders} items={items} selectedIds={checked} onSelection={Checked} activeId={selected?.id} onOpen={id=>{if(id!==selected?.id)navigate(()=>open(id))}} folderId={folderId} onFolderChange={FolderId} search={search} sortMode={sortMode} onMove={moveDataset}/>} >
  <div className="data-management-content">
  <div className="data-library-toolbar"><span className="data-toolbar-path" aria-label="当前数据目录路径">{path(folderId)}</span><div className="row"><input aria-label="搜索数据集" placeholder="在当前目录内搜索名称" value={search} onChange={e=>Q(e.target.value)}/><button title={sortLabel[sortMode]} aria-label={sortLabel[sortMode]} onClick={()=>SortMode(sortMode==='name'?'updatedDesc':sortMode==='updatedDesc'?'updatedAsc':'name')}><SortIcon size={18}/></button><button title="批量删除" aria-label="批量删除" disabled={!checked.length||busy} onClick={()=>BulkConfirm(true)}><Trash2 size={18}/>{checked.length||''}</button><button title="新增数据集" aria-label="新增数据集" disabled={busy} onClick={()=>navigate(add)}><Plus size={18}/></button><button aria-label="管理数据目录" title="管理目录" onClick={()=>Manage(true)}><FolderCog size={18}/></button></div></div>
  {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <section className="data-maintenance-pane" aria-label="数据维护" aria-busy={loading}>{loading&&<p role="status" className="muted">正在加载数据…</p>}{!selected&&!adding&&<div className="data-maintenance-empty"><Folder size={32}/><p>选择左侧数据进行预览或编辑</p><button onClick={()=>navigate(add)}>导入数据</button></div>}{(selected||adding)&&<>
   <div className="data-maintenance-header" inert={loading||undefined}>{selected?<div className="data-detail-toolbar"><h2><InlineName name={name} canEdit={editable} onSave={value=>{N(value);D(true)}}/></h2><button className="data-folder" title={path(selected.folderId)} aria-label="选择数据目录" disabled={!editable||busy} onClick={()=>Picker(true)}><Folder size={16}/>{path(selected.folderId)}</button><button title={selected.visibility==='public'?'公开：所有用户可见':'私有：仅自己可见'} aria-label={selected.visibility==='public'?'公开数据':'私有数据'} disabled={!editable||busy} onClick={()=>metadata({visibility:selected.visibility==='public'?'private':'public'})}>{selected.visibility==='public'?<Globe size={17}/>:<LockKeyhole size={17}/>}</button><span className={`data-owner ${selected.canEdit===true?'data-owner-self':'data-owner-other'}`} title={`所有者：${selected.owner?.displayName||selected.owner?.username||selected.ownerId}`}><UserRound size={16}/>{selected.owner?.displayName||selected.owner?.username||selected.ownerId}</span><div className="data-detail-actions">{editable&&<button title="保存数据" aria-label="保存数据" disabled={busy||!dirty||!name.trim()} onClick={save}><Save size={18}/></button>}<button title="历史版本" aria-label="历史版本" onClick={()=>{const seq=request.current;api(`/datasets/${selected.id}/versions`).then(r=>{if(seq===request.current)V(r.items)}).catch(e=>{if(seq===request.current)E(message(e))})}}><History size={18}/></button>{editable&&<><button title="复制数据" aria-label="复制数据" disabled={busy||dirty} onClick={async()=>{B(true);try{const copy=await api(`/datasets/${selected.id}/copy`,{method:'POST',headers:{'If-Match':String(selected.version),'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({name:`${selected.name} · 副本`})});await open(copy.id);await list()}catch(e:any){E(message(e))}finally{B(false)}}}><Copy size={18}/></button><button title={selected.canDelete===false?'已被引用，不能删除':'删除数据'} aria-label="删除数据" disabled={busy||selected.canDelete===false} onClick={()=>Delete(true)}><Trash2 size={18}/></button></>}</div></div>:<h2>新增数据集</h2>}<button title="关闭数据" aria-label="关闭" disabled={busy} onClick={()=>navigate(close)}><X size={18}/></button></div><div className="data-maintenance-body" inert={loading||undefined} onChangeCapture={()=>{if(adding)D(true)}}>
    {error&&<p className="error" role="alert">{error}</p>}
    {adding?<>
      <label className="field">数据集名称<input value={name} onChange={e=>N(e.target.value)}/></label>
      <label className="field">导入方式<select value={kind} onChange={e=>K(e.target.value)}><option value="manual">从文件导入</option><option value="bi">从 BI Studio 连接（模拟）</option></select></label>
      <TagEditor value={tags} onChange={TagsState}/>
      {kind==='bi'?<><p className="callout">BI Studio（模拟）：可输入 chart-demo-budget、chart-demo-trend、chart-demo-bridge。通过服务器模拟 API 获取演示数据；尚未连接真实 BI Studio。</p><label className="field">图表 chartId<input value={chart} onChange={e=>C(e.target.value)}/></label><button className="primary" disabled={busy} onClick={importBi}>连接并导入</button></>:<>
        <div className="callout"><b>人工导入方法</b><p>上传或粘贴 JSON：schema 定义各列 name、type 和可选 unit，rows 按列顺序填写数据，缺失值使用 null。可下载样例或从模板载入格式。</p><div className="row"><button onClick={()=>{R(JSON.stringify(toDataSpec(tableSample),null,2));D(true)}}>载入表格样例并编辑</button><a className="button" download="chart-table-sample.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(tableSample,null,2))}`}>下载表格样例</a></div></div>
        <label className="field">从模板数据格式开始<select value="" disabled={busy} onChange={async e=>{if(!e.target.value)return;const seq=request.current;try{const sample=await loadTemplatePreview(e.target.value);if(seq===request.current)R(JSON.stringify(sample.dataSpec,null,2))}catch(e:any){E(e.message)}}}><option value="">选择模板，载入样本格式</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="button">选择 JSON 文件<input type="file" accept=".json" hidden onChange={async e=>{const f=e.target.files?.[0],seq=request.current;if(f)try{const text=await f.text();if(seq!==request.current)return;R(JSON.stringify(toDataSpec(JSON.parse(text)),null,2));if(!name)N(f.name.replace(/\.json$/,''));E('')}catch(e:any){E(e.message)}}}/></label>
        {data?.resultSets?.map((r:any,index:number)=><TemplateDataTable key={r.id} result={r} dataSpec={data} editable onChange={value=>{const next=structuredClone(data);next.resultSets[index]=value;R(JSON.stringify(next,null,2))}}/>)}
        <label className="field">DataSpec JSON<textarea rows={10} value={raw} onChange={e=>R(e.target.value)}/></label><button className="primary" disabled={busy||!name.trim()||!raw} onClick={save}>校验并保存当前数据</button>
      </>}
    </>:<>
      <section className="data-detail-section"><div className="data-section-heading"><h3>数据集</h3>{selected.dataId&&<><code>{selected.dataId}</code><button type="button" title="复制数据集 ID" aria-label={`复制数据集 ID ${selected.dataId}`} onClick={copyDataId}><Copy size={15}/></button></>}</div><p className="data-detail-summary">{data?.resultSets?.length||0} 张数据表 · {data?.resultSets?.reduce((n:number,r:any)=>n+(r.rows?.length||0),0)||0} 行记录{dirty?' · 尚未保存的修改':''}</p>
      {data?.resultSets?.map((r:any,index:number)=><React.Fragment key={r.id}><TemplateDataTable result={r} dataSpec={data} editable={editable&&!busy} onChange={value=>{const next=structuredClone(data);next.resultSets[index]=value;R(JSON.stringify(next));D(true)}}/>{selected.origin?.kind==='biStudio'&&<TableRefreshQueries result={r} value={refreshConfig} editable={editable&&!busy} onChange={(value:any)=>{RefreshConfig(value);D(true)}}/>}</React.Fragment>)}
      {selected.origin?.kind==='biStudio'&&<div className="row"><span className="muted">BI Studio · Mock · 查询接口预留，当前刷新返回模拟数据</span>{editable&&<button disabled={busy||dirty} onClick={()=>Restore('source')}>刷新模拟数据</button>}</div>}
      </section>
      <section className="data-detail-section"><DatasetChartPreview dataset={selected} data={data} templates={templates}/></section>
      {versions&&<section><h3>历史版本 · 最近6版（含当前）</h3><p>回滚生成新的当前版本，关联页面随之更新。</p>{versions.map(v=><div className="version-row" key={v.version}>v{v.version} · {v.name} · {stamp(v.createdAt)}<button onClick={()=>{const seq=request.current;api(`/data-snapshots/${v.snapshotId}`).then(dataSpec=>{if(seq===request.current)H({...v,dataSpec})}).catch(e=>{if(seq===request.current)E(message(e))})}}>查看历史与差异</button>{editable&&v.canRollback&&v.version!==selected.version&&<button disabled={dirty} onClick={()=>Restore(v)}>恢复为新当前版本</button>}</div>)}</section>}
      {historical&&<details open><summary>历史 v{historical.version} 与当前数据对比</summary><p>名称：{historical.name} → {selected.name}</p><p>数据{JSON.stringify(historical.dataSpec.resultSets)===JSON.stringify(selected.dataSpec.resultSets)?'未变化':'已变化'}</p>{historical.dataSpec.resultSets.map((r:any)=><TemplateDataTable key={r.id} result={r} dataSpec={historical.dataSpec}/>)}<button onClick={()=>H(undefined)}>关闭历史查看</button></details>}
      {deleting&&<div className="callout"><p>确定删除“{selected.name}”？</p><button disabled={busy} onClick={()=>remove([selected.id])}>确认删除数据</button><button onClick={()=>Delete(false)}>取消</button></div>}
      {restore&&<div className="callout"><p>{restore==='source'?'模拟源数据将覆盖人工订正。':`将恢复 v${restore.version} 的名称与数据，并创建新版本。`}关联页面随之更新。</p><button disabled={busy||dirty} onClick={async()=>{B(true);try{await api(`/datasets/${selected.id}/${restore==='source'?'refresh':'rollback'}`,{method:'POST',headers:{'If-Match':String(selected.version)},body:JSON.stringify(restore==='source'?{force:true}:{version:restore.version})});await open(selected.id);await list();Restore(undefined)}catch(e:any){E(message(e))}finally{B(false)}}}>确认恢复</button><button onClick={()=>Restore(undefined)}>取消</button></div>}
    </>}
  </div></>}</section></div></DirectorySplit>
  {manage&&<FolderManager kind="data" onClose={()=>Manage(false)} onChanged={list}/>}
  {bulkConfirm&&<Modal title="批量删除数据" onClose={()=>BulkConfirm(false)}><p>确定删除选中的 {checked.length} 份数据？已被引用或没有权限的数据不会被删除。</p><div className="row"><button disabled={busy} onClick={()=>BulkConfirm(false)}>取消</button><button disabled={busy} onClick={()=>remove(checked)}>确认批量删除</button></div></Modal>}
  {picker&&<FolderPicker kind="data" value={selected.folderId??null} onChange={folderId=>metadata({folderId})} onClose={()=>Picker(false)}/>}
  {closeConfirm&&<Modal title="保存数据修改？" onClose={()=>decide(false)}><p>当前数据有尚未保存的修改。</p>{error&&<p className="error" role="alert">{error}</p>}<div className="row"><button disabled={busy} onClick={()=>decide(false)}>继续编辑</button><button disabled={busy} onClick={()=>decide(true)}>放弃修改</button><button disabled={busy} onClick={async()=>{if(await save())decide(true)}}>保存并继续</button></div></Modal>}
 </>
}

function TableRefreshQueries({result,value,editable,onChange}:any){
 const queries=value?.queries||[],matching=queries.filter((q:any)=>q.resultSetId===result.id);
 function update(id:string,patch:any){onChange({...value,queries:queries.map((q:any)=>q.id===id?{...q,...patch}:q)})}
 return <details className="data-query-placeholder"><summary>查询刷新 · {result.name||result.id} · {matching.length} 条查询</summary><p className="muted">DAX + 模型 ID 接口预留；Mock 不执行输入的查询语句。</p>{matching.map((q:any)=><fieldset key={q.id}><legend>{q.name||'数据查询'}</legend><label className="field">查询名称<input readOnly={!editable} value={q.name||''} onChange={e=>update(q.id,{name:e.target.value})}/></label><label className="field">查询角色<select disabled={!editable} value={q.role||'detail'} onChange={e=>update(q.id,{role:e.target.value})}><option value="detail">明细</option><option value="rowSubtotal">行小计</option><option value="columnSubtotal">列小计</option><option value="grandTotal">总计</option></select></label><label className="field">模型 ID<input readOnly={!editable} value={q.modelId||''} onChange={e=>update(q.id,{modelId:e.target.value})}/></label><label className="field">DAX 查询<textarea readOnly={!editable} rows={3} value={q.text||''} onChange={e=>update(q.id,{text:e.target.value})}/></label></fieldset>)}{!matching.length&&<p className="muted">此表尚未配置刷新查询。</p>}{editable&&!matching.length&&<button onClick={()=>onChange({...value,mode:'biStudioMock',queries:[...queries,{id:crypto.randomUUID(),name:`${result.name||result.id}查询`,resultSetId:result.id,role:'detail',language:'dax',text:'',modelId:''}]})}>添加表查询</button>}</details>
}

function RoleBindings({ data, scene, schema, initial, onChange }: any) {
  const [value, V] = useState<any>(()=>initial?structuredClone(initial):undefined);
  const sets = data.resultSets || [];
  function changeSet(id: string) {
    const rs = sets.find((r: any) => r.id === id);
    if (!rs) return;
    const num = rs.fields.filter((f: any) =>
      ["decimal", "integer"].includes(f.type),
    );
    const cat = rs.primaryKey?.[0] || rs.fields[0]?.id || "";
    const roles = schema ? initialRoles(rs,schema,data) :
      scene === "revenueBridge"
        ? {
            stepKey: cat,
            label: cat,
            role: "",
            value: num[0]?.id || "",
            sort: "",
          }
        : {
            categoryKey: cat,
            categoryLabel: cat,
            series: num
              .slice(0, scene === "monthlyTrend" ? 1 : 2)
              .map((f: any) => f.id),
          };
    const b = { main: { resultSetId: id, roles } };
    V(b);
    onChange(b);
  }
  const rs = sets.find((r: any) => r.id === value?.main?.resultSetId);
  return (
    <div className="chart-field-config">
      <h4 className="chart-field-config-title">图表配置</h4>
      <label className="field chart-source-field">
        绑定数据表
        <select
          value={value?.main?.resultSetId || ""}
          onChange={(e) => changeSet(e.target.value)}
        >
          <option value="">请选择结果集</option>
          {sets.map((r: any) => (
            <option key={r.id} value={r.id}>
              {r.name || r.id}
            </option>
          ))}
        </select>
      </label>
      {value&&<div className="chart-role-grid">{schema && Object.entries(schema as Record<string,any>).filter(([,rule])=>rule.multiple&&rule.max>1).map(([key,rule])=><label className="field chart-role-count" key={key}>{rule.label}数量<select value={Array.isArray(value.main.roles[key])?value.main.roles[key].length:rule.min??1} onChange={e=>{const next=structuredClone(value);const old=Array.isArray(next.main.roles[key])?next.main.roles[key]:[];next.main.roles[key]=Array.from({length:Number(e.target.value)},(_,i)=>old[i]??'');V(next);onChange(next)}}>{Array.from({length:(rule.max??4)-(rule.min??1)+1},(_,i)=>i+(rule.min??1)).map(count=><option key={count}>{count}</option>)}</select></label>)}
      {value &&
        Object.entries(value.main.roles).flatMap(([role, v]) =>
          (Array.isArray(v) ? v : [v]).map((field, index) => (
            <label className="field chart-role-field" key={role + index}>
              {schema?.[role]?.label || role}
              {Array.isArray(v) ? ` ${index + 1}` : ""}
              <select
                value={String(field)}
                onChange={(e) => {
                  const next = structuredClone(value);
                  if (Array.isArray(v))
                    next.main.roles[role][index] = e.target.value;
                  else next.main.roles[role] = e.target.value;
                  V(next);
                  onChange(next);
                }}
              >
                <option value="">未绑定</option>
                {eligibleFields(rs,schema?.[role],data).map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {fieldLabel(data, f)} · {f.type}
                  </option>
                ))}
              </select>
            </label>
          )),
        )}</div>}
    </div>
  );
}

export function RefreshQueries({value,onChange,readOnly=false,resultSets=[]}:any){
 const config=value||{mode:'manual',queries:[]};
 const [sources,Sources]=useState<any[]>([]);useEffect(()=>{let active=true;api('/data-sources').then(r=>{if(active)Sources(r.items||[])}).catch(()=>{});return()=>{active=false}},[]);
 const recommended=(query:any)=>sources.find(source=>source.modelId===query.modelId&&(!source.languages||source.languages.includes(query.language))); 
 const update=(index:number,patch:any)=>onChange({...config,queries:config.queries.map((q:any,i:number)=>i===index?{...q,...patch}:q)});
 return <section className="refresh-queries"><h3>刷新途径与查询</h3>{readOnly?<p>{config.mode==='biStudioMock'?'BI Studio · Mock':'人工维护'}{config.chartId?` · 图表 ${config.chartId}`:''}</p>:<label className="field">刷新途径<select value={config.mode} onChange={e=>onChange({...config,mode:e.target.value})}><option value="manual">人工维护</option><option value="biStudioMock">BI Studio · Mock</option></select></label>}
 {config.mode==='biStudioMock'&&<p className="callout">Mock 使用模拟结果验证刷新流程，不执行输入的 DAX 查询语句。</p>}
 {!config.queries?.length&&<p className="muted">尚未配置查询，当前图表使用已保存数据。</p>}
 {(config.queries||[]).map((query:any,index:number)=><fieldset key={query.id}><legend>{query.name||`查询 ${index+1}`}</legend><div className="query-fields">
 <label className="field">查询名称<input readOnly={readOnly} value={query.name||''} onChange={e=>update(index,{name:e.target.value})}/></label>
 <label className="field">查询角色<select disabled={readOnly} value={query.role||'detail'} onChange={e=>update(index,{role:e.target.value})}><option value="detail">明细</option><option value="rowSubtotal">行小计</option><option value="columnSubtotal">列小计</option><option value="grandTotal">总计</option></select></label>
 <label className="field">结果集<select disabled={readOnly} value={query.resultSetId||''} onChange={e=>update(index,{resultSetId:e.target.value})}><option value="">选择结果集</option>{resultSets.map((rs:any)=><option key={rs.id} value={rs.id}>{rs.name||rs.id}</option>)}</select></label>
 <label className="field">图表输入分组<input readOnly={readOnly} value={query.chartGroup||''} placeholder="同一图表的明细、小计、总计使用相同名称" onChange={e=>update(index,{chartGroup:e.target.value||undefined})}/></label>
 <label className="field">查询语言<select disabled={readOnly} value={query.language||'dax'} onChange={e=>update(index,{language:e.target.value})}><option value="dax">DAX</option><option value="sql">SQL（预留，暂不执行）</option></select></label>
 <label className="field">模型 ID<input readOnly={readOnly} value={query.modelId||''} onChange={e=>update(index,{modelId:e.target.value||undefined})}/></label>
 <label className="field">数据源<input aria-label="数据源" readOnly={readOnly} value={query.dataSourceId||''} placeholder={recommended(query)?`推荐：${recommended(query).name}`:'数据源标识'} onChange={e=>update(index,{dataSourceId:e.target.value||undefined})}/>{!readOnly&&recommended(query)&&<button onClick={()=>update(index,{dataSourceId:recommended(query).id})}>使用模型推荐数据源</button>}</label>
 </div><label className="field">查询语句<textarea rows={4} readOnly={readOnly} value={query.text||''} onChange={e=>update(index,{text:e.target.value})}/></label>{query.language==='sql'&&<p className="callout">SQL 查询仅保存配置，当前不执行刷新。</p>}{!readOnly&&<button onClick={()=>onChange({...config,queries:config.queries.filter((_:any,i:number)=>i!==index)})}>移除此查询</button>}</fieldset>)}
 {!readOnly&&<button onClick={()=>onChange({...config,queries:[...(config.queries||[]),{id:crypto.randomUUID(),name:`查询 ${(config.queries?.length||0)+1}`,language:'dax',text:'',resultSetId:resultSets[0]?.id||'',role:'detail',chartGroup:'main'}]})}>添加查询</button>}
 </section>
}
