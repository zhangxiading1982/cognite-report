// @vitest-environment jsdom
import React from 'react';
import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {TemplateLibrary} from './TemplateLibrary';
import {LibraryNavigationProvider} from './LibraryNavigation';
vi.mock('./TemplateThumbnail',()=>({TemplateThumbnail:()=>null}));
afterEach(cleanup);
test('template maintenance icons only appear for owner and library has no use action',()=>{render(<TemplateLibrary templates={[{id:'a',name:'我的模板',canEdit:true,canDelete:true},{id:'b',name:'公共模板',canEdit:false,canDelete:false}]} onRefresh={()=>{}}/>);expect(screen.queryByRole('button',{name:'编辑 我的模板'})).toBeNull();expect(screen.queryByRole('button',{name:'查看 我的模板'})).toBeNull();expect(screen.getByRole('button',{name:'删除 我的模板'})).toBeTruthy();expect(screen.queryByRole('button',{name:'编辑 公共模板'})).toBeNull();expect(screen.queryByRole('button',{name:'使用模板'})).toBeNull()});

test('puts template search and creation controls in the feature toolbar without a repeated heading',()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[]})));
 render(<LibraryNavigationProvider kind="templates"><TemplateLibrary templates={[]} onRefresh={()=>{}}/></LibraryNavigationProvider>);
 expect(screen.getByPlaceholderText('搜索模板名称').closest('.library-toolbar')).toBeTruthy();
 expect(screen.getByRole('button',{name:'导入模板'}).closest('.library-toolbar')).toBeTruthy();
 expect(screen.getByRole('button',{name:'管理目录'}).closest('.library-toolbar')).toBeTruthy();
 expect(screen.queryByRole('heading',{name:'模板库'})).toBeNull();
});
