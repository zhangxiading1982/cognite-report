import {LibraryNavigationProvider,LibraryWorkspace} from './LibraryNavigation';
import {useAuth} from './Auth';
import {UserManagement} from './UserManagement';
import {TemplateLibrary} from './TemplateLibrary';
import React,{useEffect,useRef,useState} from 'react';
import {LayoutDashboard,PanelsTopLeft,Database,Download,Search,Star,Users,LogOut,PanelLeftClose,PanelLeftOpen,Trash2} from 'lucide-react';
import {api,post,Template} from './api';
import {Wizard} from './Wizard';
import {Editor} from './Editor';
import {DataManagement,TemplatePreview} from './DataManagement';
import {AssetLibrary} from './AssetLibrary';
import {ContentWorkspace} from './ContentWorkspace';
import {TemplateThumbnail} from './TemplateThumbnail';
export function App(){
 const {user,logout}=useAuth();
 const initial=location.pathname;
 const initialDatasetId=initial==='/data'?new URLSearchParams(location.search).get('dataset')||undefined:undefined;
 const [page,P]=useState(initial.startsWith('/users')&&user?.role==='admin'?'users':initial.startsWith('/library')?'templates':initial.startsWith('/exports')?'exports':initial==='/assets'?'assets':['/data','/samples'].includes(initial)?'data':'contents'),[templates,T]=useState<Template[]>([]),[jobs,J]=useState<any[]>([]),[error,E]=useState(''),[search,Q]=useState(''),[wizard,W]=useState(initial==='/slides/new'),[preview,PV]=useState<string>(),[legacy,L]=useState<any>(),[contentId,CI]=useState<string>();
 const [workspaceVersion,WV]=useState(0),[collapsed,Collapse]=useState(false);
 const leave=useRef<()=>Promise<void>>(async()=>{});
 async function refresh(){try{T((await api('/templates')).items);}catch(e:any){E(e.message);}}
 useEffect(()=>{refresh();if(initial==='/samples')history.replaceState({},'','/data');if(['/','/slides','/decks'].includes(initial))history.replaceState({},'','/contents');const id=initial.match(/^\/slides\/([^/]+)$/)?.[1];if(id&&id!=='new')api(`/slides/${id}`).then(L).catch(e=>E(e.message));},[]);
 useEffect(()=>{if(page!=='exports')return;const poll=()=>api('/export-jobs').then(r=>J(r.items)).catch(e=>E(e.message));poll();const timer=setInterval(poll,1600);return()=>clearInterval(timer);},[page]);
 async function navigate(p:string){if(p===page&&p==='data'){Collapse(true);return}try{await leave.current();leave.current=async()=>{};L(undefined);Collapse(true);P(p);Q('');CI(undefined);if(p==='contents')WV(v=>v+1);history.pushState({},'',p==='templates'?'/library/templates':`/${p}`);}catch(e:any){if(e.code!=='NAVIGATION_CANCELLED')E(e.message);}}
 async function created(s:any){try{W(false);PV(undefined);const d=await post('/contents',{title:s.title});await post(`/contents/${d.id}/pages`,{revision:d.revision,slideId:s.id});CI(d.id);P('contents');history.pushState({},'',`/contents/${d.id}`);}catch(e:any){E(e.message);}}
 if(legacy)return <Editor initial={legacy} templates={templates} onClose={()=>navigate('contents')} onOpen={L} onExports={()=>navigate('exports')}/>;
 return <LibraryNavigationProvider kind={page==='assets'?'assets':page==='templates'?'templates':null}><div className={`app ${collapsed?'navigation-collapsed':''}`}><aside className="sidebar"><a className="brand" href="/contents" onClick={e=>{e.preventDefault();navigate('contents');}}><span className="brandmark">S</span><span className="brand-name">Slide Report</span><span className="beta">工作台</span></a><div className="workspace-label">个人工作空间</div><nav>{[['contents',LayoutDashboard,'我的文档'],['templates',PanelsTopLeft,'模板库'],['data',Database,'数据管理'],['assets',PanelsTopLeft,'资源库'],['exports',Download,'导出记录']].map(([id,Icon,label]:any)=><div key={id} className="nav-item"><button className={page===id?'active':''} aria-label={label} title={label} onClick={()=>navigate(id)}><Icon size={18}/><span className="navigation-label">{label}</span></button></div>)}</nav><button className="navigation-toggle" title={collapsed?'展开功能导航':'收起功能导航'} aria-label={collapsed?'展开功能导航':'收起功能导航'} aria-expanded={!collapsed} onClick={()=>Collapse(!collapsed)}>{collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button></aside><div className="main"><header className="topbar"><span className="topbar-current">{{contents:'我的文档',templates:'模板库',data:'数据管理',assets:'资源库',exports:'导出记录',users:'用户管理'}[page]}</span><div className="workspace-toolbar-space"/><div className="workspace-account">{user?.role==='admin'&&<button title="用户管理" aria-label="用户管理" className={page==='users'?'active':''} onClick={()=>navigate('users')}><Users size={18}/></button>}{user&&<><span className="workspace-username" title={user.displayName}>{user.username}</span><button title="退出登录" aria-label="退出登录" onClick={async()=>{try{await leave.current();await logout();}catch(e:any){if(e.code!=='NAVIGATION_CANCELLED')E(e.message);}}}><LogOut size={18}/></button></>}</div></header><main className={`dashboard ${['templates','assets','data'].includes(page)?'directory-dashboard':''}`}>{error&&<div role="alert" className="error">{error}<button onClick={()=>E('')}>关闭</button></div>}
 {page==='contents'&&<ContentWorkspace key={`${contentId||'workspace'}:${workspaceVersion}`} initialId={contentId} templates={templates} registerLeave={fn=>{leave.current=fn;}} onExports={()=>{}}/>} 
 {page==='templates'&&<LibraryWorkspace><TemplateLibrary templates={templates} onRefresh={refresh} onError={E}/></LibraryWorkspace>}
 {page==='users'&&user?.role==='admin'&&<UserManagement/>}
 {page==='data'&&<DataManagement templates={templates} onCreated={created} initialDatasetId={initialDatasetId} registerLeave={fn=>{leave.current=fn;}}/>}{page==='assets'&&<LibraryWorkspace><AssetLibrary/></LibraryWorkspace>}{page==='exports'&&<ExportList jobs={jobs} onError={E} onDeleted={id=>J(items=>items.filter(item=>item.id!==id))}/>}</main></div>
 {preview&&<TemplatePreview templateId={preview} templates={templates} onClose={()=>PV(undefined)} onCreated={created}/>}{wizard&&<Wizard templates={templates} onClose={()=>W(false)} onCreated={created}/>}</div></LibraryNavigationProvider>;
}
export function ExportList({
  jobs,
  onError,
  onDeleted,
}: {
  jobs: any[];
  onError: (s: string) => void;
  onDeleted?: (id:string)=>void;
}) {
  const [search,setSearch]=useState('');
  const states: any = {
    queued: "排队中",
    running: "生成中",
    succeeded: "已完成",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    canceled: "已取消",
  };
  const visible=jobs.filter(job=>(job.title||job.slideTitle||'业务页面').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return (
    <div className="export-history"><div className="content-list-toolbar"><Search size={17}/><input aria-label="文档名称" placeholder="文档名称" value={search} onChange={event=>setSearch(event.target.value)}/></div><div className="list">
      {!jobs.length && (
        <div className="empty">
          <Download size={38} />
          <h3>还没有导出记录</h3>
          <p>在页面编辑器中完成预检，即可生成 PPTX。</p>
        </div>
      )}
      {visible.map((j) => (
        <article key={j.id}>
          <Download size={22} />
          <div>
            <h3>
              {j.title || j.slideTitle || "业务页面"}{" "}
              <span className="tag">r{j.revision}</span>
            </h3>
            <p>
              {j.deliveryMode === "draft" ? "草稿" : "正式版本"} ·{" "}
              {j.createdAt
                ? new Date(j.createdAt).toLocaleString("zh-CN")
                : j.id}
            </p>
            {(j.error || j.errorCode) && (
              <p className="error">
                {j.errorDetail?.message ||
                  (j.error
                    ? typeof j.error === "string"
                      ? j.error
                      : j.error.message
                    : `生成失败：${j.errorCode}。可重试相同版本；若仍失败，请检查页面和资源。`)}
              </p>
            )}
          </div>
          <span className={`tag ${j.state === "failed" ? "bad" : ""}`}>
            {states[j.state] || j.state}
          </span>
          {["succeeded", "completed"].includes(j.state) ? (
            <>
              <a
                className="button primary"
                href={`/api/export-jobs/${j.id}/file.pptx`}
                download={`slide-report-${j.id}.pptx`}
              >
                下载 PPTX
              </a>
              <a className="button" href={`/api/export-jobs/${j.id}/manifest`}>
                清单
              </a>
            </>
          ) : ["queued", "running"].includes(j.state) ? (
            <button
              onClick={() =>
                post(`/export-jobs/${j.id}/cancel`).catch((e) =>
                  onError(e.message),
                )
              }
            >
              取消
            </button>
          ) : (
            <button
              onClick={() =>
                post(`/export-jobs/${j.id}/retry`).catch((e) =>
                  onError(e.message),
                )
              }
            >
              重试相同版本
            </button>
          )}
          {!["queued","running"].includes(j.state)&&<button title="删除导出记录及文件" aria-label={`删除导出记录 ${j.title||j.slideTitle||"业务页面"}`} onClick={async()=>{if(!window.confirm(`确定删除「${j.title||j.slideTitle||"业务页面"}」的导出记录和 PPTX 文件？`))return;try{await api(`/export-jobs/${j.id}`,{method:'DELETE'});onDeleted?.(j.id)}catch(error:any){onError(error.message)}}}><Trash2 size={17}/></button>}
        </article>
      ))}
      {!!jobs.length&&!visible.length&&<div className="empty"><p>没有匹配的导出记录</p></div>}
    </div></div>
  );
}
