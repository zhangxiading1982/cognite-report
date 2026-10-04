// @vitest-environment jsdom
import React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {DataManagement} from './DataManagement';

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()});

const spec={source:{modelId:'m'},semanticSchema:{tables:[]},resultSets:[{id:'r',name:'经营数据',primaryKey:[],fields:[{id:'amount',name:'金额',type:'decimal'}],rows:[{amount:'12'}]}]};
const dataset=(id:string,name:string,updatedAt:string,patch:any={})=>({id,name,updatedAt,version:1,canEdit:true,canDelete:true,visibility:'private',origin:{kind:'manual'},tags:{用途:['页面数据']},dataSpec:spec,...patch});

function mock(items:any[]){
 const calls:any[]=[];
 vi.stubGlobal('fetch',async(url:string,init:any={})=>{
  calls.push([url,init]);
  if(url==='/api/datasets')return new Response(JSON.stringify({items}));
  if(url==='/api/folders?kind=data')return new Response(JSON.stringify({items:[{id:'quarter',name:'季度',parentId:null,canEdit:true}]}));
  if(url.endsWith('/templates'))return new Response(JSON.stringify({items:[]}));
  if(url.startsWith('/api/management/data/'))return new Response(JSON.stringify({id:url.split('/').pop(),folderId:JSON.parse(init.body).folderId}));
  const id=url.match(/^\/api\/datasets\/([^/]+)$/)?.[1];
  return new Response(JSON.stringify(items.find(item=>item.id===id)||{items:[]}));
 });
 return calls;
}

it('opens a dataset supplied by a chart-data deep link',async()=>{
 const item=dataset('managed-1','已绑定经营数据','2026-09-30T02:00:00Z');
 mock([item]);
 render(<DataManagement templates={[]} onCreated={()=>{}} initialDatasetId="managed-1"/>);
 expect(await screen.findByRole('heading',{name:'已绑定经营数据'})).toBeTruthy();
});

it('sorts by name initially and cycles updated time descending and ascending from the toolbar',async()=>{
 const older=dataset('a','A 数据','2026-09-01T02:00:00Z');
 const newer=dataset('b','B 数据','2026-09-30T02:00:00Z');
 mock([newer,older]);
 render(<DataManagement templates={[]} onCreated={()=>{}}/>);
 await screen.findByRole('button',{name:'预览 A 数据'});
 const names=()=>screen.getAllByRole('button',{name:/^预览 /}).map(node=>node.getAttribute('aria-label'));
 expect(names()).toEqual(['预览 A 数据','预览 B 数据']);
 fireEvent.click(screen.getByRole('button',{name:'排序：名称升序'}));
 await waitFor(()=>expect(names()).toEqual(['预览 B 数据','预览 A 数据']));
 expect(screen.getByRole('button',{name:'排序：更新时间降序'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'排序：更新时间降序'}));
 await waitFor(()=>expect(names()).toEqual(['预览 A 数据','预览 B 数据']));
 expect(screen.getByRole('button',{name:'排序：更新时间升序'})).toBeTruthy();
});

it('moves a dropped editable dataset through the management metadata API',async()=>{
 const item=dataset('d','经营数据','2026-09-30T02:00:00Z');
 const calls=mock([item]);
 render(<DataManagement templates={[]} onCreated={()=>{}}/>);
 const leaf=await screen.findByRole('button',{name:'预览 经营数据'});
 fireEvent.dragStart(leaf,{dataTransfer:{setData:vi.fn(),getData:()=> 'd',effectAllowed:'move'}});
 const folder=screen.getByRole('button',{name:'打开目录 季度'});
 fireEvent.dragOver(folder,{dataTransfer:{dropEffect:'move'}});
 fireEvent.drop(folder,{dataTransfer:{getData:()=> 'd'}});
 await waitFor(()=>expect(calls.some(([url,init])=>url==='/api/management/data/d'&&init.method==='PATCH'&&JSON.parse(init.body).folderId==='quarter')).toBe(true));
});
