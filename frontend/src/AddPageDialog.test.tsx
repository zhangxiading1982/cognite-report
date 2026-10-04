// @vitest-environment jsdom
import React from 'react';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {AddPageDialog} from './AddPageDialog';
vi.mock('./TemplateThumbnail',()=>({TemplateThumbnail:()=> <span>模板预览</span>}));
afterEach(()=>{cleanup();vi.restoreAllMocks()});
const template={id:'budget',name:'预算对比',scene:'budget',version:1};
it('creates a template page directly from its own data without offering dataset binding',async()=>{
 const requests:any[]=[];const created=vi.fn();vi.stubGlobal('fetch',async(url:string,init:any={})=>{if(init.method==='POST')requests.push([url,JSON.parse(init.body)]);return new Response(JSON.stringify({id:'slide'}))});
 render(<AddPageDialog templates={[template]} onCreated={created} onClose={()=>{}} onImport={()=>{}}/>);
 expect(screen.queryByLabelText('图表数据')).toBeNull();expect(screen.getByText(/直接使用模板自带数据/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'添加页面'}));await waitFor(()=>expect(created).toHaveBeenCalledWith({id:'slide'}));expect(requests).toEqual([['/api/slides/from-template',{templateId:'budget'}]]);
});
it('creates blank pages without requiring a template or managed dataset',async()=>{
 const requests:any[]=[];const created=vi.fn();vi.stubGlobal('fetch',async(url:string,init:any={})=>{if(init.method==='POST')requests.push([url,JSON.parse(init.body)]);return new Response(JSON.stringify(url==='/api/datasets?view=chart'?{items:[]}:{id:'blank'}))});
 render(<AddPageDialog templates={[]} onCreated={created} onClose={()=>{}} onImport={()=>{}}/>);fireEvent.click(screen.getByRole('tab',{name:'空白页'}));fireEvent.change(screen.getByLabelText('页面名称'),{target:{value:'结论'}});fireEvent.click(screen.getByRole('button',{name:'添加页面'}));await waitFor(()=>expect(created).toHaveBeenCalled());expect(requests).toEqual([['/api/slides/blank',{title:'结论'}]]);
});
it('retains the selected template and page name when creation fails',async()=>{let body:any;vi.stubGlobal('fetch',async(_url:string,init:any={})=>{body=JSON.parse(init.body);return new Response(JSON.stringify({message:'模板数据无效'}),{status:422})});render(<AddPageDialog templates={[template]} onCreated={()=>{}} onClose={()=>{}} onImport={()=>{}}/>);fireEvent.change(screen.getByLabelText('页面名称'),{target:{value:'预算页'}});fireEvent.click(screen.getByRole('button',{name:'添加页面'}));await screen.findByRole('alert');expect(body).toEqual({templateId:'budget',title:'预算页'});expect((screen.getByLabelText('页面名称') as HTMLInputElement).value).toBe('预算页');});
