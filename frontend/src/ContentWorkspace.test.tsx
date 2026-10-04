// @vitest-environment jsdom
import React from 'react';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {ContentWorkspace} from './ContentWorkspace';
const flush=vi.hoisted(()=>vi.fn());
const download=vi.hoisted(()=>vi.fn());
vi.mock('./Editor',()=>({Editor:({initial,registerFlush,onOpen}:any)=>{React.useEffect(()=>registerFlush(flush),[]);return <div>正在编辑 {initial.title}<button onClick={()=>onOpen({id:"copy",title:"本地副本"})}>模拟另存副本</button></div>;}}));
vi.mock('./export-download',()=>({downloadPptxExport:download}));
beforeEach(()=>download.mockReset().mockResolvedValue({state:'succeeded'}));
afterEach(()=>{cleanup();vi.restoreAllMocks();history.replaceState({},'','/');});
it('blocks switching pages when saving the current page fails',async()=>{
 history.replaceState({},'','/contents/c1');flush.mockRejectedValue(new Error('保存失败，请重试'));
 const spec={title:'文稿',sections:[{id:'pages',title:'正文',order:0}],instances:[],structurePolicy:{cover:false,agenda:false,sectionDividers:false,agendaPageCapacity:8},numbering:{mode:'contentOnly',showTotal:true}};
 vi.stubGlobal('fetch',async(url:string)=>new Response(JSON.stringify(url==='/api/contents/c1'?{id:'c1',revision:1,spec,pages:[{instanceId:'a',slideId:'p1',title:'第一页',order:0},{instanceId:'b',slideId:'p2',title:'第二页',order:1}]}:url.startsWith('/api/slides/')?{id:'p1',title:'第一页'}:{items:[]})));
 render(<ContentWorkspace templates={[]} onExports={()=>{}}/>);
 await screen.findByText('正在编辑 第一页');fireEvent.click(screen.getByRole('button',{name:'编辑第 2 页 第二页'}));
 await screen.findByText('保存失败，请重试');expect(screen.getByText('正在编辑 第一页')).toBeTruthy();
});
it('flushes an unsaved document title before leaving and propagates save errors',async()=>{
 history.replaceState({},'','/contents/c1');flush.mockResolvedValue(undefined);let leave:()=>Promise<void>=async()=>{};
 const spec={title:'原始标题',sections:[{id:'pages',title:'正文',order:0}],instances:[],structurePolicy:{cover:false,agenda:false,sectionDividers:false,agendaPageCapacity:8},numbering:{mode:'contentOnly',showTotal:true}};
 const requests:any[]=[];vi.stubGlobal('fetch',async(url:string,init:any={})=>{if(init.method==='PUT'){requests.push(JSON.parse(init.body));return new Response(JSON.stringify({message:'版本冲突，不能保存'}),{status:409});}return new Response(JSON.stringify(url==='/api/contents/c1'?{id:'c1',revision:3,spec,pages:[]}:{items:[]}));});
 render(<ContentWorkspace templates={[]} onExports={()=>{}} registerLeave={fn=>{leave=fn;}}/>);fireEvent.change(await screen.findByLabelText('文稿标题'),{target:{value:'待保存标题'}});await expect(leave()).rejects.toThrow('版本冲突');expect(requests[0]).toMatchObject({revision:3,spec:{title:'待保存标题'}});expect((screen.getByLabelText('文稿标题') as HTMLInputElement).value).toBe('待保存标题');
});
it('attaches a conflict copy to the current document without re-saving the conflicting page',async()=>{
 history.replaceState({},'','/contents/c1');flush.mockRejectedValue(new Error('旧页冲突'));let attached=false;
 const spec={title:'文稿',sections:[{id:'pages',title:'正文',order:0}],instances:[],structurePolicy:{cover:false,agenda:false,sectionDividers:false,agendaPageCapacity:8},numbering:{mode:'contentOnly',showTotal:true}};
 const before={id:'c1',revision:1,spec,pages:[{instanceId:'a',slideId:'p1',title:'原页',order:0}]};
 const after={...before,revision:2,pages:[...before.pages,{instanceId:'b',slideId:'copy',title:'本地副本',order:1}]};
 vi.stubGlobal('fetch',async(url:string,init:any={})=>{
  if(url==='/api/contents/c1/pages'){expect(JSON.parse(init.body)).toEqual({revision:1,slideId:'copy'});attached=true;return new Response(JSON.stringify(after));}
  return new Response(JSON.stringify(url==='/api/contents/c1'?(attached?after:before):url==='/api/slides/p1'?{id:'p1',title:'原页'}:url==='/api/slides/copy'?{id:'copy',title:'本地副本'}:{items:[]}));
 });
 render(<ContentWorkspace templates={[]} onExports={()=>{}}/>);await screen.findByText('正在编辑 原页');fireEvent.click(screen.getByText('模拟另存副本'));await screen.findByText('正在编辑 本地副本');expect(attached).toBe(true);expect(screen.getByRole('button',{name:'编辑第 2 页 本地副本'})).toBeTruthy();
});
it('keeps preview separate from export and exports only after a fresh successful preflight',async()=>{
 history.replaceState({},'','/contents/c1');flush.mockResolvedValue(undefined);const exported=vi.fn();let invalid=false;const posts:string[]=[];
 const spec={title:'文稿',sections:[{id:'pages',title:'正文',order:0}],instances:[],structurePolicy:{cover:false,agenda:false,sectionDividers:false},numbering:{mode:'contentOnly'}};
 vi.stubGlobal('fetch',async(url:string,init:any={})=>{if(init.method==='POST')posts.push(url);return new Response(JSON.stringify(url.endsWith('/preview')?{previewId:'frozen',svgs:['<svg/>'],diagnostics:invalid?[{severity:'error',message:'缺失绑定'}]:[]}:url==='/api/contents/c1'?{id:'c1',revision:2,spec,pages:[{instanceId:'a',slideId:'p1',title:'第一页',order:0}]}:url.startsWith('/api/slides/')?{id:'p1',title:'第一页'}:{items:[]}));});
 render(<ContentWorkspace templates={[]} onExports={exported}/>);await screen.findByText('正在编辑 第一页');fireEvent.click(screen.getByRole('button',{name:'预览文稿'}));await screen.findByRole('heading',{name:'文稿预览 · 1 页'});expect(screen.queryByRole('button',{name:'导出多页 PPTX'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'全屏预览当前页'}));expect(document.querySelector('.content-preview-fullscreen')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'退出全屏预览'}));expect(document.querySelector('.content-preview-fullscreen')).toBeNull();expect(posts).toEqual(['/api/decks/c1/preview']);fireEvent.click(screen.getByRole('button',{name:'关闭'}));invalid=true;fireEvent.click(screen.getByRole('button',{name:'导出 PPT'}));await screen.findByText('缺失绑定');expect(posts.filter(x=>x.endsWith('/export'))).toHaveLength(0);expect(exported).not.toHaveBeenCalled();invalid=false;fireEvent.click(screen.getByRole('button',{name:'导出 PPT'}));const {waitFor}=await import('@testing-library/react');await waitFor(()=>expect(exported).toHaveBeenCalledTimes(1));expect(posts.slice(-2)).toEqual(['/api/decks/c1/preview','/api/decks/c1/export']);expect(download).toHaveBeenCalledWith(expect.anything(),'文稿');
});
it('shows a compact document gallery with name search and icon actions',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[{id:'doc',title:'经营汇报',revision:1,pageCount:0,updatedAt:'2026-09-25T01:00:00Z',visibility:'private',canEdit:true,canDelete:true,pages:[]}]})));
 render(<ContentWorkspace templates={[]} onExports={()=>{}}/>);
 await screen.findByRole('button',{name:'打开文稿 经营汇报'});
 expect(screen.getByPlaceholderText('文稿名称')).toBeTruthy();
 expect(screen.queryByRole('heading',{name:'我的文稿'})).toBeNull();
 expect(screen.queryByText('搜索文稿名称')).toBeNull();
 expect(screen.getByRole('button',{name:'新建文稿'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'经营汇报 · 私有，点击设为公开'})).toBeTruthy();
});
it('keeps page actions compact and puts navigation and chapter settings in a dedicated dialog',async()=>{
 history.replaceState({},'','/contents/c1');flush.mockResolvedValue(undefined);
 const spec={title:'文稿',sections:[{id:'pages',title:'正文',order:0}],instances:[],structurePolicy:{cover:false,agenda:false,sectionDividers:false},numbering:{mode:'contentOnly'}};
 vi.stubGlobal('fetch',async(url:string)=>new Response(JSON.stringify(url==='/api/contents/c1'?{id:'c1',revision:1,spec,pages:[{instanceId:'a',slideId:'p1',title:'第一页',sectionId:'pages',order:0}]}:url.startsWith('/api/slides/')?{id:'p1',title:'第一页'}:{items:[]})));
 render(<ContentWorkspace templates={[]} onExports={()=>{}}/>);await screen.findByText('正在编辑 第一页');
 expect(screen.queryByRole('button',{name:'上移第 1 页'})).toBeNull();expect(screen.getByRole('button',{name:'复制第 1 页'})).toBeTruthy();expect(screen.queryByRole('checkbox',{name:'导航页'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'导航与交付设置'}));expect(screen.getByRole('dialog',{name:'导航与交付设置'})).toBeTruthy();expect(screen.getByRole('checkbox',{name:'导航页'})).toBeTruthy();expect(screen.getByRole('combobox',{name:'第 1 页章节'})).toBeTruthy();
});
it('uses one document toolbar for the title, whole-document save, add, settings, preview and export',async()=>{
 history.replaceState({},'','/contents/c1');flush.mockResolvedValue(undefined);
 const spec={title:'经营分析',sections:[{id:'pages',title:'正文',order:0}],instances:[],structurePolicy:{cover:false,agenda:false,sectionDividers:false},numbering:{mode:'contentOnly'}};
 vi.stubGlobal('fetch',async(url:string)=>new Response(JSON.stringify(url==='/api/contents/c1'?{id:'c1',revision:1,spec,pages:[{instanceId:'a',slideId:'p1',title:'第一页',sectionId:'pages',order:0}]}:url.startsWith('/api/slides/')?{id:'p1',title:'第一页'}:{items:[]})));
 render(<ContentWorkspace templates={[]} onExports={()=>{}}/>);await screen.findByText('正在编辑 第一页');
 expect((screen.getByLabelText('文稿标题') as HTMLInputElement).value).toBe('经营分析');
 expect(screen.getByRole('button',{name:'保存文稿'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'新增页面'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'导航与交付设置'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'预览文稿'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'导出 PPT'})).toBeTruthy();
});
it('turns explicit Save into a reviewed document snapshot that can export immediately',async()=>{
 history.replaceState({},'','/contents/c1');flush.mockResolvedValue(undefined);const exported=vi.fn(),calls:string[]=[];
 const spec={id:'c1',revision:2,title:'经营分析',sections:[{id:'pages',title:'正文',order:0}],instances:[{instanceId:'a',slideRef:{id:'p1',revision:2},sectionId:'pages',order:0,included:true}],structurePolicy:{cover:false,agenda:false,sectionDividers:false,agendaPageCapacity:8},numbering:{mode:'contentOnly',showTotal:true}};
 const before={id:'c1',revision:2,spec,pages:[{instanceId:'a',slideId:'p1',title:'第一页',revision:2,sectionId:'pages',order:0}]};
 const snap={...before,revision:3,spec:{...spec,revision:3,instances:[{...spec.instances[0],slideRef:{id:'p1',revision:3}}]},pages:[{...before.pages[0],revision:3}]};let current=before;
 vi.stubGlobal('fetch',async(url:string,init:any={})=>{calls.push(`${init.method||'GET'} ${url}`);if(url==='/api/contents/c1/snapshots'){current=snap;return new Response(JSON.stringify(snap));}if(url.endsWith('/preview'))return new Response(JSON.stringify({previewId:'approved',svgs:['<svg/>'],diagnostics:[]}));if(url.endsWith('/export'))return new Response(JSON.stringify({id:'job'}));if(url==='/api/contents/c1')return new Response(JSON.stringify(current));if(url.startsWith('/api/slides/'))return new Response(JSON.stringify({id:'p1',title:'第一页',revision:current.pages[0].revision}));return new Response(JSON.stringify({items:[]}));});
 render(<ContentWorkspace templates={[]} onExports={exported}/>);await screen.findByText('正在编辑 第一页');fireEvent.click(screen.getByRole('button',{name:'保存文稿'}));await screen.findByText('正在编辑 第一页');await vi.waitFor(()=>expect(calls).toContain('POST /api/contents/c1/snapshots'));expect(flush).toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'导出 PPT'}));await vi.waitFor(()=>expect(exported).toHaveBeenCalledTimes(1));expect(calls).toContain('POST /api/decks/c1/export');expect(download).toHaveBeenCalledWith({id:'job'},'经营分析');
});
