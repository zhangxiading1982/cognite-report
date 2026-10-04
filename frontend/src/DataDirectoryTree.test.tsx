// @vitest-environment jsdom
import React from 'react';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,test,expect,vi} from 'vitest';
import {DataDirectoryTree} from './DataDirectoryTree';
afterEach(cleanup);
test('directory tree lets an owner select referenced data while blocking non-owner selection',()=>{
 const change=vi.fn(),open=vi.fn();render(<DataDirectoryTree folders={[{id:'f',name:'季度',parentId:null}]} items={[{id:'a',name:'销售',folderId:'f',canEdit:true,canDelete:true},{id:'b',name:'引用数据',canEdit:true,canDelete:false},{id:'c',name:'他人数据',canEdit:false}]} selectedIds={[]} onSelection={change} onOpen={open} folderId={null} onFolderChange={()=>{}} search=""/>);
 fireEvent.click(screen.getByRole('button',{name:'预览 销售'}));expect(open).toHaveBeenCalledWith('a');
 expect((screen.getByRole('checkbox',{name:'选择 引用数据'}) as HTMLInputElement).disabled).toBe(false);
 expect((screen.getByRole('checkbox',{name:'选择 他人数据'}) as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('checkbox',{name:'选择 销售'}));expect(change).toHaveBeenCalledWith(['a']);
 fireEvent.click(screen.getByRole('checkbox',{name:'选择 引用数据'}));expect(change).toHaveBeenCalledWith(['b']);
});
test('search stays in selected folder subtree',()=>{render(<DataDirectoryTree folders={[{id:'f',name:'季度',parentId:null}]} items={[{id:'a',name:'销售',folderId:'f'},{id:'b',name:'外部销售'}]} selectedIds={[]} onSelection={()=>{}} onOpen={()=>{}} folderId="f" onFolderChange={()=>{}} search="销售"/>);expect(screen.getByRole('button',{name:'预览 销售'})).toBeTruthy();expect(screen.queryByRole('button',{name:'预览 外部销售'})).toBeNull()});

test('shows latest update time and sorts datasets by name by default',()=>{
 const {container}=render(<DataDirectoryTree folders={[]} items={[
  {id:'b',name:'Zulu',updatedAt:'2026-09-30T06:20:00Z'},
  {id:'a',name:'Alpha',updatedAt:'2026-09-29T03:10:00Z'}
 ]} selectedIds={[]} onSelection={()=>{}} onOpen={()=>{}} folderId={null} onFolderChange={()=>{}} search=""/>);
 const labels=screen.getAllByRole('button',{name:/预览/}).map(button=>button.getAttribute('aria-label'));
 expect(labels).toEqual(['预览 Alpha','预览 Zulu']);
 const time=container.querySelector('time[datetime="2026-09-30T06:20:00Z"]');
 expect(time).not.toBeNull();
 expect(time?.classList.contains('data-tree-updated')).toBe(true);
});

test.each([
 ['updatedAsc',['旧数据','新数据']],
 ['updatedDesc',['新数据','旧数据']]
] as const)('sorts datasets with %s', (sortMode,names)=>{
 render(<DataDirectoryTree sortMode={sortMode} folders={[]} items={[
  {id:'new',name:'新数据',updatedAt:'2026-09-30T06:20:00Z'},
  {id:'old',name:'旧数据',updatedAt:'2026-09-20T06:20:00Z'}
 ]} selectedIds={[]} onSelection={()=>{}} onOpen={()=>{}} folderId={null} onFolderChange={()=>{}} search=""/>);
 expect(screen.getAllByRole('button',{name:/预览/}).map(button=>button.getAttribute('aria-label')?.replace('预览 ',''))).toEqual(names);
});

test('moves an editable dataset to a folder by drag and drop',()=>{
 const move=vi.fn();
 render(<DataDirectoryTree folders={[{id:'target',name:'目标目录',parentId:null}]} items={[{id:'a',name:'销售',folderId:null,canEdit:true}]} selectedIds={[]} onSelection={()=>{}} onOpen={()=>{}} folderId={null} onFolderChange={()=>{}} search="" onMove={move}/>);
 const leaf=screen.getByRole('button',{name:'预览 销售'}).closest('[role="treeitem"]')!;
 const folder=screen.getByRole('button',{name:'打开目录 目标目录'}).closest('.data-tree-row')!;
 fireEvent.dragStart(leaf,{dataTransfer:{setData:vi.fn(),effectAllowed:'move'}});
 fireEvent.dragOver(folder,{dataTransfer:{dropEffect:'move'}});
 fireEvent.drop(folder,{dataTransfer:{getData:()=> 'a'}});
 expect(move).toHaveBeenCalledWith('a','target');
 expect(screen.getByRole('status').textContent).toContain('已将“销售”移动到“目标目录”');
});

test('offers a keyboard accessible move action and prevents moving non-owner data',()=>{
 const move=vi.fn();
 render(<DataDirectoryTree folders={[{id:'target',name:'目标目录',parentId:null}]} items={[
  {id:'a',name:'销售',folderId:null,canEdit:true},
  {id:'b',name:'他人数据',folderId:null,canEdit:false}
 ]} selectedIds={[]} onSelection={()=>{}} onOpen={()=>{}} folderId={null} onFolderChange={()=>{}} search="" onMove={move}/>);
 expect(screen.queryByRole('button',{name:'移动 他人数据'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'移动 销售'}));
 fireEvent.change(screen.getByRole('combobox',{name:'选择“销售”的目标目录'}),{target:{value:'target'}});
 fireEvent.click(screen.getByRole('button',{name:'确认移动 销售'}));
 expect(move).toHaveBeenCalledWith('a','target');
});

test('accepts a drop on the root directory',()=>{
 const move=vi.fn();
 render(<DataDirectoryTree folders={[{id:'source',name:'来源目录',parentId:null}]} items={[{id:'a',name:'销售',folderId:'source',canEdit:true}]} selectedIds={[]} onSelection={()=>{}} onOpen={()=>{}} folderId={null} onFolderChange={()=>{}} search="" onMove={move}/>);
 const leaf=screen.getByRole('button',{name:'预览 销售'}).closest('[role="treeitem"]')!;
 const root=screen.getByRole('button',{name:'全部数据'}).closest('.data-tree-row')!;
 fireEvent.dragStart(leaf,{dataTransfer:{setData:vi.fn(),effectAllowed:'move'}});
 fireEvent.drop(root,{dataTransfer:{getData:()=> 'a'}});
 expect(move).toHaveBeenCalledWith('a',null);
});
