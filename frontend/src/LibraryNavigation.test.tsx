// @vitest-environment jsdom
import React from 'react';
import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,act} from '@testing-library/react';
import {LibraryNavigationProvider,LibraryTree,LibraryToolbar,FolderPicker,useLibraryNavigation} from './LibraryNavigation';
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
function Selected(){const n=useLibraryNavigation();return <span data-testid="selected">{n.folderId||'root'}</span>}
test('expanded library directory keeps parent context and breadcrumb supports returning to root',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[{id:'a',name:'品牌素材',parentId:null,canEdit:true},{id:'b',name:'服饰',parentId:'a',canEdit:true}]})));
 render(<LibraryNavigationProvider kind="assets"><LibraryTree/><LibraryToolbar/><Selected/></LibraryNavigationProvider>);
 await screen.findByRole('button',{name:'目录 品牌素材'});fireEvent.click(screen.getByRole('button',{name:'目录 服饰'}));
 expect(screen.getByTestId('selected').textContent).toBe('b');expect(screen.getByRole('navigation',{name:'当前位置'}).textContent).toContain('品牌素材');
 fireEvent.click(screen.getByRole('button',{name:'返回资源库根目录'}));expect(screen.getByTestId('selected').textContent).toBe('root');
 fireEvent.click(screen.getByRole('button',{name:'管理目录'}));expect(screen.getByRole('dialog',{name:'资源库目录管理'})).toBeTruthy();
});

test('directory maintenance does not change the current browsing directory',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[{id:'a',name:'品牌素材',parentId:null,canEdit:true}]})));
 render(<LibraryNavigationProvider kind="assets"><LibraryTree/><LibraryToolbar/><Selected/></LibraryNavigationProvider>);
 await screen.findByRole('button',{name:'目录 品牌素材'});
 fireEvent.click(screen.getByRole('button',{name:'管理目录'}));
 fireEvent.click(await screen.findByRole('button',{name:'打开目录 品牌素材'}));
 expect(screen.getByTestId('selected').textContent).toBe('root');
});

test('folder picker shows a tree and does not allow moving into another owners directory',async()=>{
 const changed=vi.fn(),close=vi.fn();
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[{id:'a',name:'父目录',parentId:null,canEdit:true},{id:'b',name:'共享目录',parentId:'a',canEdit:false}]})));
 render(<FolderPicker kind="templates" value={null} onChange={changed} onClose={close}/>);
 const foreign=await screen.findByRole('button',{name:'选择目录 共享目录'});expect((foreign as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'选择目录 父目录'}));expect(changed).toHaveBeenCalledWith('a');expect(close).toHaveBeenCalledOnce();
});
test('late folder responses cannot replace the newly opened library directories',async()=>{
 let resolveAssets:(value:Response)=>void=()=>{};
 vi.stubGlobal('fetch',(url:string)=>url.includes('assets')?new Promise<Response>(resolve=>resolveAssets=resolve):Promise.resolve(new Response(JSON.stringify({items:[{id:'t',name:'模板目录',parentId:null}]}))));
 const view=render(<LibraryNavigationProvider kind="assets"><LibraryTree/></LibraryNavigationProvider>);
 view.rerender(<LibraryNavigationProvider kind="templates"><LibraryTree/></LibraryNavigationProvider>);
 await screen.findByRole('button',{name:'目录 模板目录'});
 await act(async()=>resolveAssets(new Response(JSON.stringify({items:[{id:'a',name:'资源旧目录',parentId:null}]}))));
 expect(screen.queryByRole('button',{name:'目录 资源旧目录'})).toBeNull();expect(screen.getByRole('button',{name:'目录 模板目录'})).toBeTruthy();
});

test('library tree begins at a compact slash root without a grouping heading',()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[]})));
 render(<LibraryNavigationProvider kind="templates"><LibraryTree/></LibraryNavigationProvider>);
 expect(screen.queryByText('分组目录')).toBeNull();expect(screen.getByRole('button',{name:'目录根路径 /'}).textContent).toBe('/');
});

test('toolbar renders a slash based path and keeps controls in the same toolbar',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[{id:'a',name:'品牌素材',parentId:null,canEdit:true},{id:'b',name:'图标',parentId:'a',canEdit:true}]})));
 render(<LibraryNavigationProvider kind="assets"><LibraryTree/><LibraryToolbar><label>资源名称<input/></label></LibraryToolbar></LibraryNavigationProvider>);
 await screen.findByRole('button',{name:'目录 图标'});
 fireEvent.click(screen.getByRole('button',{name:'目录 图标'}));
 const toolbar=document.querySelector('.library-toolbar')!;
 expect(screen.getByRole('navigation',{name:'当前位置'}).textContent).toBe('/品牌素材/图标');
 expect(screen.getByLabelText('资源名称').closest('.library-toolbar')).toBe(toolbar);
 expect(screen.getByRole('button',{name:'管理目录'}).closest('.library-toolbar')).toBe(toolbar);
});
