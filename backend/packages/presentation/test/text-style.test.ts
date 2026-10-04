import {it,expect} from 'vitest';
import fixture from '../../../../../prompt/sd/examples/monthly-operations.data.json';
import budget from '../../../../../prompt/sd/examples/budget.slide.json';
import {compileSlide,renderSlideSvg} from '../src/index';
const sample=()=>{const s=structuredClone(budget) as any;s.elements=[{id:'txt',type:'text',rect:{x:40,y:40,w:400,h:100},z:1,runs:[{text:'业务 Report\n第二行'}],style:{fontSize:20,fontFace:'Microsoft YaHei',bold:true,italic:true,align:'right',valign:'bottom'}}];return s;};
it('preserves common Office font and both text alignment axes through compilation and SVG',()=>{
 const c=compileSlide(sample(),fixture as any); const n=c.elements.find(e=>e.id==='txt')!;
 expect(n.fontFace).toBe('Microsoft YaHei');expect(n.valign).toBe('bottom');expect(n.bold).toBe(true);expect(n.italic).toBe(true);
 const svg=renderSlideSvg({...c,elements:[n]});expect(svg).toContain('text-anchor="end"');expect(svg).toContain('font-style="italic"');expect(svg).toContain('y="90"');
});
it.each([{fontFace:'anything<script>'},{valign:'diagonal'},{align:'invalid'},{bold:'yes'},{italic:1}])('rejects invalid text settings %o',(style)=>{
 const s=sample();Object.assign(s.elements[0].style,style);expect(compileSlide(s,fixture as any).diagnostics.some(e=>e.code==='INVALID_STYLE')).toBe(true);
});
it('layout style overrides take precedence for font and alignment',()=>{
 const s=sample();s.layoutOverrides={txt:{style:{fontFace:'Arial',valign:'middle',align:'center'}}};const n=compileSlide(s,fixture as any).elements.find(e=>e.id==='txt')!;expect(n.fontFace).toBe('Arial');expect(n.valign).toBe('middle');expect(n.align).toBe('center');
});
it('compiles text-box fill and dashed outline into the SVG preview',()=>{const s=sample();Object.assign(s.elements[0].style,{fill:'#FFF4CC',line:{color:'#B45309',width:2,dash:'dash'}});const c=compileSlide(s,fixture as any),n=c.elements.find(e=>e.id==='txt')!;expect(n.fill).toBe('#FFF4CC');expect(n.line).toEqual({color:'#B45309',width:2,dash:'dash'});const svg=renderSlideSvg({...c,elements:[n]});expect(svg).toContain('fill="#FFF4CC"');expect(svg).toContain('stroke-dasharray');});
it('compiles editable shape text with its fill, outline and typography',()=>{const s=sample();s.elements=[{id:'shape',type:'shape',shape:'roundRect',rect:{x:40,y:40,w:220,h:100},z:1,fill:'#DCEAE8',line:{color:'#155E75',width:3,dash:'dash'},runs:[{text:'形状内文字'}],style:{fontFace:'SimHei',fontSize:18,color:'#123456',bold:true,align:'center',valign:'middle'}}];const c=compileSlide(s,fixture as any),n=c.elements.find(e=>e.id==='shape')!;expect(n).toMatchObject({type:'shape',text:'形状内文字',fontFace:'SimHei',fontSize:18,color:'#123456',bold:true});const svg=renderSlideSvg({...c,elements:[n]});expect(svg).toContain('形状内文字');expect(svg).toContain('font-weight="bold"');expect(svg).toContain('stroke-dasharray');});
it.each(['triangle','diamond'])('renders the %s shape as native SVG geometry',(shape)=>{const s=sample();s.elements=[{id:shape,type:'shape',shape,rect:{x:40,y:40,w:220,h:120},z:1,fill:'#DCEAE8',line:{color:'#155E75',width:2},runs:[{text:'形状'}],style:{bold:true}}];const c=compileSlide(s,fixture as any),n=c.elements[0];expect(n.shape).toBe(shape);const svg=renderSlideSvg({...c,elements:[n]});expect(svg).toContain('<polygon');expect(svg).toContain('font-weight="bold"')});
