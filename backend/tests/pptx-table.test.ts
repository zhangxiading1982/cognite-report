import {it,expect} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import JSZip from 'jszip';
import {writePptx} from '../src/export/pptx';
it('exports a single editable styled native table without generating extra slides',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'slidebi-table-'));
 try{await writePptx({canvas:{width:960,height:540,unit:'pt'},theme:{fontFace:'Noto Sans CJK SC',background:'FFFFFF',textColor:'1F2937',seriesColors:['2563EB']},diagnostics:[],elements:[{id:'table',type:'table',rect:{x:40,y:40,w:600,h:200},rows:[['地区','收入'],['华东','12000000']],fontSize:16,fontFace:'Noto Sans CJK SC',bold:true,fill:'DDEEFF',bodyFill:'FFF7ED',line:{color:'AABBCC',width:2}}]},join(dir,'t.pptx'),async()=>{throw Error('unexpected asset')});
 const zip=await JSZip.loadAsync(await readFile(join(dir,'t.pptx')));expect(zip.file(/ppt\/slides\/slide\d+\.xml$/)).toHaveLength(1);const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');expect(xml).toContain('<a:tbl>');expect(xml).toContain('12000000');expect(xml).toContain('华东');
 expect(xml).toContain('DDEEFF');expect(xml).toContain('FFF7ED');expect(xml).toContain('AABBCC');expect(xml).toContain(' b="1"');
 }finally{await rm(dir,{recursive:true,force:true})}
});
