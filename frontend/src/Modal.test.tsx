// @vitest-environment jsdom
import React from 'react';
import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {Modal} from './ui';
afterEach(cleanup);
test('Escape closes only the active nested directory dialog',()=>{
 const closeParent=vi.fn(),closeChild=vi.fn();
 render(<Modal title="模板" onClose={closeParent}><Modal title="选择目录" onClose={closeChild}><button>目录</button></Modal></Modal>);
 fireEvent.keyDown(screen.getByRole('dialog',{name:'选择目录'}),{key:'Escape'});
 expect(closeChild).toHaveBeenCalledOnce();expect(closeParent).not.toHaveBeenCalled();
});
