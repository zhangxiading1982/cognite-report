// @vitest-environment jsdom
import React from 'react';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {test,expect,vi,afterEach} from 'vitest';
import {TemplateCanvasEditor} from './TemplateCanvasEditor';
afterEach(cleanup);
test('canvas edits selected text and resolved geometry without creating a document',()=>{const change=vi.fn(),slide={canvas:{width:960,height:540},elements:[{id:'title',type:'text',rect:{x:10,y:10,w:200,h:80},runs:[{text:'旧标题'}],style:{fontSize:24}}],layoutOverrides:{title:{rect:{x:20}}}};render(<TemplateCanvasEditor slide={slide} svg="<svg/>" onChange={change} onClose={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'选择文字 title'}));expect((screen.getByLabelText('水平位置') as HTMLInputElement).value).toBe('20');fireEvent.change(screen.getByLabelText('文字内容'),{target:{value:'新标题'}});expect(change.mock.calls[0][0].elements[0].runs).toEqual([{text:'新标题'}]);expect(slide.elements[0].runs[0].text).toBe('旧标题');fireEvent.change(screen.getByLabelText('水平位置'),{target:{value:'30'}});expect(change.mock.calls[1][0].elements[0].rect.x).toBe(30);expect(change.mock.calls[1][0].layoutOverrides.title.rect).toBeUndefined()});
