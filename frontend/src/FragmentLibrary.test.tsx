// @vitest-environment jsdom
import React from 'react';import {it,expect,vi,afterEach} from 'vitest';import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {FragmentLibrary} from './FragmentLibrary';
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it('saves selected persisted revision and offers source or target theme insertion',async()=>{
 const fetcher=vi.fn(async(url:any,options:any)=>new Response(JSON.stringify(options?.method==='POST'?{id:'f'}:{items:[{id:'f',name:'经营卡片',tags:['经营'],spec:{elements:[],bindings:{}}}]})));vi.stubGlobal('fetch',fetcher);
 const save=vi.fn(async()=>({id:'s',revision:7}));const insert=vi.fn();render(<FragmentLibrary selected={['a','b']} flush={save} onInsert={insert}/>);
 await screen.findByText('经营卡片');fireEvent.change(screen.getByLabelText('片段名称'),{target:{value:'卡片'}});fireEvent.click(screen.getByRole('button',{name:'保存所选为片段'}));await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledWith('/api/fragments',expect.objectContaining({body:JSON.stringify({slideId:'s',revision:7,elementIds:['a','b'],name:'卡片',tags:[]})})));
 fireEvent.click(screen.getByRole('button',{name:'使用当前主题插入 经营卡片'}));expect(insert).toHaveBeenCalledWith(expect.any(Object),'target');
});
