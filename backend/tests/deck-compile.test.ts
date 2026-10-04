import { test, expect } from 'vitest';
import { compileDeck, type DeckSpec, type CompiledSlide } from '@slidebi/presentation';
import { writeDeckPptx } from '../src/export/pptx.ts';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
const page: CompiledSlide={canvas:{width:960,height:540,unit:'pt'},theme:{fontFace:'Arial',background:'#ffffff',textColor:'#111111',seriesColors:['#2563eb']},elements:[{id:'title',type:'text',text:'内容',rect:{x:40,y:40,w:400,h:40}}],diagnostics:[]};
const sources=Object.fromEntries(['a','b','c'].map(id=>[`${id}@1`,page]));
function spec():DeckSpec{return {title:'月度汇报',sections:['a','b','c'].map((id,order)=>({id,title:id,order})),instances:['a','b','c'].map((id,order)=>({instanceId:id,slideRef:{id,revision:1},sectionId:id,order,included:true})),structurePolicy:{cover:true,agenda:true,sectionDividers:true,agendaPageCapacity:8},numbering:{mode:'contentOnly',showTotal:true}};}
test('three sections produce eight physical pages, agenda links and content-only numbering',()=>{
 const result=compileDeck(spec(),sources);expect(result.diagnostics).toEqual([]);expect(result.slides).toHaveLength(8);
 expect(result.slides[1].elements.filter(e=>e.hyperlinkSlide).map(e=>e.hyperlinkSlide)).toEqual([4,6,8]);
 expect(result.slides.filter(s=>s.elements.some(e=>e.id==='deck-page-number')).map(s=>s.elements.find(e=>e.id==='deck-page-number')!.text)).toEqual(['1 / 3','2 / 3','3 / 3']);
 expect(result.slides[0].theme.fontFace).toBe('SimHei');expect(result.slides[3].theme.fontFace).toBe('Arial');expect(page.elements).toHaveLength(1);
});
test('excluded section disappears and reordered pages recompute targets and display numbers',()=>{
 const value=spec();value.instances[1].included=false;value.sections[2].order=-1;
 const r=compileDeck(value,sources);expect(r.slides).toHaveLength(6);
 expect(r.slides[1].elements.filter(e=>e.hyperlinkSlide).map(e=>[e.text,e.hyperlinkSlide])).toEqual([['c    1',4],['a    2',6]]);
});
test('agenda pagination and physical numbering account for all structure pages',()=>{
 const value=spec();value.structurePolicy.agendaPageCapacity=2;value.numbering.mode='physical';
 const r=compileDeck(value,sources);expect(r.slides).toHaveLength(9);
 expect(r.slides.flatMap(s=>s.elements.filter(e=>e.hyperlinkSlide).map(e=>e.hyperlinkSlide))).toEqual([5,7,9]);
 expect(r.slides[4].elements.find(e=>e.id==='deck-page-number')!.text).toBe('5 / 9');
});
test('duplicate source instances remain independent and invalid references are diagnosed',()=>{
 const value=spec();value.instances[1].slideRef={id:'a',revision:1};expect(compileDeck(value,sources).slides).toHaveLength(8);
 value.instances[1].instanceId='a';expect(compileDeck(value,sources).diagnostics.some(d=>d.code==='DUPLICATE_INSTANCE')).toBe(true);
 value.instances[1].instanceId='b';value.instances[1].sectionId='absent';expect(compileDeck(value,sources).diagnostics.some(d=>d.code==='UNKNOWN_SECTION')).toBe(true);
 value.instances[1].sectionId='b';value.instances[1].slideRef={id:'missing',revision:1};expect(compileDeck(value,sources).diagnostics.some(d=>d.code==='MISSING_SLIDE')).toBe(true);
});
test('empty and malformed decks are rejected without partial output',()=>{
 expect(compileDeck({...spec(),instances:[]},sources).diagnostics.some(d=>d.code==='EMPTY_DECK')).toBe(true);
 expect(compileDeck({...spec(),structurePolicy:{...spec().structurePolicy,agendaPageCapacity:0}},sources).slides).toEqual([]);
 expect(compileDeck(null as any,sources).diagnostics[0].severity).toBe('error');
});
test('multipage PPT contains editable text and valid internal slide relationships',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'slidebi-deck-'));
 try{const file=path.join(dir,'deck.pptx');const r=compileDeck(spec(),{...sources,'b@1':page});await writeDeckPptx(r.slides,file,async()=>{throw Error('Unexpected asset')});
 const zip=await JSZip.loadAsync(await readFile(file));expect(zip.file(/^ppt\/slides\/slide\d+\.xml$/)).toHaveLength(8);
 const rels=await zip.file('ppt/slides/_rels/slide2.xml.rels')!.async('string');for(const n of [4,6,8])expect(rels).toContain(`slide${n}.xml`);
 const xml=await zip.file('ppt/slides/slide2.xml')!.async('string');expect(xml).toContain('ppaction://hlinksldjump');expect(xml).toContain('a    1');expect(xml).not.toContain('u="sng"');expect(xml).toContain('u="none"');
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('page numbers stay below standard source footer and reject a fully occupied footer band',()=>{
 const value=spec();value.structurePolicy={cover:false,agenda:false,sectionDividers:false,agendaPageCapacity:8};value.instances=value.instances.slice(0,1);
 const footer={id:'source',type:'text' as const,text:'数据来源',rect:{x:24,y:486,w:912,h:30}};
 const compiled=compileDeck(value,{'a@1':{...page,elements:[...page.elements,footer]}});
 expect(compiled.diagnostics).toEqual([]);expect(compiled.slides[0].elements.find(e=>e.id==='deck-page-number')!.rect.y).toBeGreaterThanOrEqual(516);
 const blocked=compileDeck(value,{'a@1':{...page,elements:[{...footer,rect:{x:0,y:510,w:960,h:30}}]}});
 expect(blocked.diagnostics.some(d=>d.code==='PAGE_NUMBER_OVERLAP')).toBe(true);
});
test('mixed-font decks keep chart East Asian fonts for their own pages',async()=>{
 const chart:CompiledSlide={...page,elements:[{id:'chart',type:'nativeChart',chartType:'bar',rect:{x:40,y:100,w:800,h:350},categories:[{id:'a',label:'收入'}],series:[{id:'s',name:'实际',sourceValues:['10'],values:[10],color:'#2563eb'}]}]};
 const dir=await mkdtemp(path.join(tmpdir(),'slidebi-deck-font-'));
 try{const file=path.join(dir,'fonts.pptx');await writeDeckPptx([{...page,theme:{...page.theme,fontFace:'SimHei'}},chart,{...chart,theme:{...chart.theme,fontFace:'SimSun'}}],file,async()=>{throw Error('Unexpected asset')});
 const zip=await JSZip.loadAsync(await readFile(file));
 expect(await zip.file('ppt/charts/chart1.xml')!.async('string')).toContain('<a:ea typeface="Arial"');
 expect(await zip.file('ppt/charts/chart2.xml')!.async('string')).toContain('<a:ea typeface="SimSun"');
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('draft assembly explicitly marks generated structure pages',()=>{
 const r=compileDeck(spec(),sources,'draft');
 for(let i=0;i<r.navigation.length;i++) if(r.navigation[i].kind!=='content') expect(r.slides[i].elements.some(e=>e.id==='draft-watermark'&&e.text==='草稿')).toBe(true);
 expect(compileDeck(spec(),sources,'final').slides[0].elements.some(e=>e.id==='draft-watermark')).toBe(false);
});
test('source preflight diagnostics preserve report preview while writer still rejects export',async()=>{
 const source={...page,diagnostics:[{code:'NEEDS_REVIEW',severity:'error' as const,message:'请复核'}]};
 const r=compileDeck(spec(),{...sources,'b@1':source});expect(r.slides).toHaveLength(8);expect(r.diagnostics.some(d=>d.code==='NEEDS_REVIEW')).toBe(true);
 await expect(writeDeckPptx(r.slides,'unused.pptx',async()=>{throw Error('Unexpected asset')})).rejects.toThrow('PREFLIGHT_FAILED');
});
