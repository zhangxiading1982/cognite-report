// @vitest-environment jsdom
import React from 'react';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {DirectoryBrowser,InlineName} from './DirectoryBrowser';
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it('browses direct children',async()=>{vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[{id:'f1',name:'经营',parentId:null},{id:'f2',name:'季度',parentId:'f1'}]})));const select=vi.fn();render(<DirectoryBrowser kind="data" value={null} onChange={select}/>);fireEvent.click(await screen.findByRole('button',{name:'打开目录 经营'}));expect(select).toHaveBeenCalledWith('f1');expect(screen.queryByRole('button',{name:'打开目录 季度'})).toBeNull()});
it('only owner can double click rename',()=>{render(<InlineName name="数据" canEdit={false} onSave={vi.fn()}/>);fireEvent.doubleClick(screen.getByText('数据'));expect(screen.queryByRole('textbox')).toBeNull()});
it('owner can rename with Enter and persist the trimmed name',async()=>{const save=vi.fn();render(<InlineName name="收入" canEdit onSave={save}/>);fireEvent.doubleClick(screen.getByText('收入'));const input=screen.getByRole('textbox');fireEvent.change(input,{target:{value:' 月收入 '}});fireEvent.blur(input);expect(save).toHaveBeenCalledWith('月收入')});
