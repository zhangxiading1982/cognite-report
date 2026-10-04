// @vitest-environment jsdom
import React from 'react';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,test,expect,vi} from 'vitest';
import {DirectorySplit} from './DirectorySplit';
beforeEach(()=>{const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});});
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
test('directory width is keyboard adjustable, bounded, and restored independently',()=>{
 const view=render(<DirectorySplit storageKey="assets" directory={<p>目录</p>}><p>内容</p></DirectorySplit>);
 const handle=screen.getByRole('separator',{name:'调整目录宽度'});
 expect(handle.getAttribute('aria-valuenow')).toBe('200');
 fireEvent.keyDown(handle,{key:'ArrowRight'});expect(handle.getAttribute('aria-valuenow')).toBe('216');
 fireEvent.keyDown(handle,{key:'Home'});expect(handle.getAttribute('aria-valuenow')).toBe('160');
 fireEvent.keyDown(handle,{key:'ArrowLeft'});expect(handle.getAttribute('aria-valuenow')).toBe('160');
 fireEvent.keyDown(handle,{key:'End'});expect(handle.getAttribute('aria-valuenow')).toBe('420');
 view.unmount();render(<DirectorySplit storageKey="assets" directory={<p>目录</p>}><p>内容</p></DirectorySplit>);
 expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('420');
});
