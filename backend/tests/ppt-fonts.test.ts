import { expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { compileSlide, createSlide, type CompiledSlide, FONT_OPTIONS } from '@slidebi/presentation';
import { fontCss } from '../packages/presentation/src/fonts.ts';
import { fixture } from '../src/db.ts';
import { writePptx } from '../src/export/pptx.ts';
import { normalizeFontXml } from '../src/export/ppt-fonts.ts';

async function sample(): Promise<CompiledSlide> {
  const data = await fixture();
  const compiled = compileSlide(createSlide(data,'budget-comparison'),data,'draft');
  const chart = compiled.elements.find(e=>e.type==='nativeChart')!;
  compiled.elements = (['top','middle','bottom'] as const).map((valign,i)=>({
    id:`text-${i}`,type:'text',text:'中文排版 ABC\n第二行 123',rect:{x:24+i*310,y:24,w:280,h:130},
    fontFace:i===1?'Arial':'SimHei',fontSize:20,bold:i===1,italic:i===2,
    align:(['left','center','right'] as const)[i],valign,
  }));
  compiled.elements.push({...chart,rect:{x:24,y:200,w:800,h:300}});
  return compiled;
}
async function generate() {
  const dir = await mkdtemp(path.join(tmpdir(),'slidebi-ppt-fonts-'));
  const file = path.join(dir,'font-layout.pptx');
  await writePptx(await sample(),file,async()=>{throw new Error('Unexpected image')});
  return {dir,file,zip:await JSZip.loadAsync(await readFile(file))};
}
test('PPT text preserves fonts, bold/italic, alignment and fixed pre-wrapped line geometry',async()=>{
  const {dir,zip}=await generate();
  try {
    const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
    const bodies=xml.match(/<a:bodyPr[^>]*>/g)!;
    expect(bodies.slice(0,3).map(x=>/anchor="([^"]+)"/.exec(x)?.[1])).toEqual(['t','ctr','b']);
    expect(bodies.slice(0,3).every(x=>x.includes('wrap="none"'))).toBe(true);
    expect(xml.match(/<a:lnSpc><a:spcPts val="2500"\/><\/a:lnSpc>/g)).toHaveLength(6);
    expect(xml).toContain('algn="ctr"'); expect(xml).toContain('algn="r"');
    expect(xml).toMatch(/<a:rPr[^>]* b="1"/); expect(xml).toMatch(/<a:rPr[^>]* i="1"/);
    expect(xml).toContain('<a:ea typeface="Arial"');
    expect(xml).toContain('中文排版 ABC'); expect(xml).toContain('第二行 123');
  }finally{await rm(dir,{recursive:true,force:true})}
});
test('PPT chart and theme Chinese fonts are explicit and match the compiled theme',async()=>{
  const {dir,zip}=await generate();
  try {
    const theme=await zip.file('ppt/theme/theme1.xml')!.async('string');
    expect(theme.match(/<a:ea typeface="SimHei"\s*\/>/g)).toHaveLength(2);
    expect(theme.match(/<a:font script="Hans" typeface="SimHei"\s*\/>/g)).toHaveLength(2);
    const chart=await zip.file(/^ppt\/charts\/chart\d+\.xml$/)[0].async('string');
    const props=chart.match(/<a:(?:defRPr|rPr|endParaRPr)\b[^>]*>[\s\S]*?<\/a:(?:defRPr|rPr|endParaRPr)>/g)!;
    expect(props.length).toBeGreaterThan(0);
    expect(props.every(p=>p.includes('<a:ea typeface="SimHei"'))).toBe(true);
    expect(chart).toContain('<c:barChart>');
    expect(zip.file(/^ppt\/embeddings\/.*\.xlsx$/)).toHaveLength(1);
  }finally{await rm(dir,{recursive:true,force:true})}
});
test('font normalization preserves explicit East Asian and Latin choices, chart text and custom Hans mappings',()=>{
  const chart = '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:r><a:rPr><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/></a:rPr><a:t>营收 &amp; 成本 &lt;计划&gt;</a:t></a:r><a:defRPr><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:defRPr></c:chartSpace>';
  const updated = normalizeFontXml(chart,'SimHei','chart');
  expect(updated).toContain('<a:latin typeface="Arial"/>');
  expect(updated).toContain('<a:ea typeface="Microsoft YaHei"/>');
  expect(updated).toContain('<a:latin typeface="Calibri"/><a:ea typeface="SimHei"/><a:cs typeface="Arial"/>');
  expect(updated).toContain('营收 &amp; 成本 &lt;计划&gt;');
  expect(normalizeFontXml(updated,'SimHei','chart')).toBe(updated);
  const theme = '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="SimSun"/><a:cs typeface=""/><a:font script="Hans" typeface="SimSun"/></a:majorFont></a:theme>';
  expect(normalizeFontXml(theme,'SimHei','theme')).toContain('<a:ea typeface="SimSun"/><a:cs typeface=""/><a:font script="Hans" typeface="SimSun"/>');
});
test.runIf(existsSync('/Applications/LibreOffice.app/Contents/MacOS/soffice'))('font layout PPTX opens in LibreOffice and produces a readable PDF',async()=>{
  const {dir,file}=await generate();
  try {
    await promisify(execFile)('/Applications/LibreOffice.app/Contents/MacOS/soffice',[`-env:UserInstallation=${pathToFileURL(path.join(dir,'profile')).href}`,'--headless','--convert-to','pdf','--outdir',dir,file],{timeout:30000});
    const pdf=await readFile(path.join(dir,'font-layout.pdf'));expect(pdf.subarray(0,5).toString()).toBe('%PDF-');
    if(existsSync('/opt/homebrew/bin/pdftotext')){
      const {stdout}=await promisify(execFile)('/opt/homebrew/bin/pdftotext',[path.join(dir,'font-layout.pdf'),'-']);
      expect(stdout).toContain('中文排版');expect(stdout).toContain('第二行');
    }
  }finally{await rm(dir,{recursive:true,force:true})}
},40000);

test('default and legacy default fonts compile to SimHei without mutating saved pages', async () => {
 const data=await fixture();const slide=createSlide(data,'budget-comparison');
 const title=slide.elements.find(e=>e.type==='text')!;
 title.style={...title.style,fontFace:'Noto Sans CJK SC'};
 const compiled=compileSlide(slide,data,'draft');
 expect(compiled.theme.fontFace).toBe('SimHei');
 expect(compiled.elements.find(e=>e.id===title.id)?.fontFace).toBe('SimHei');
 expect(title.style.fontFace).toBe('Noto Sans CJK SC');
 expect(FONT_OPTIONS[0].id).toBe('SimHei');
 expect(FONT_OPTIONS.some(f=>f.id==='Noto Sans CJK SC')).toBe(false);
 expect(fontCss('SimHei')).toContain('SimHei');
 expect(compiled.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
});
