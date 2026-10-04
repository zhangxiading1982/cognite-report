// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {downloadPptxExport,pptxFilename} from './export-download';

afterEach(()=>vi.restoreAllMocks());

it('uses a PowerPoint-safe .pptx filename',()=>{
 expect(pptxFilename('经营/月报:华东.pptx')).toBe('经营_月报_华东.pptx');
 expect(pptxFilename('   ')).toBe('SlideBI 文稿.pptx');
});

it('waits for the export job, verifies PPTX bytes and downloads it directly',async()=>{
 const clicks:string[]=[];
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){clicks.push(`${this.download}|${this.href}`)});
 vi.stubGlobal('URL',{createObjectURL:vi.fn(()=> 'blob:pptx'),revokeObjectURL:vi.fn()});
 let polls=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  if(url==='/api/export-jobs/job-1')return new Response(JSON.stringify(++polls===1?{id:'job-1',state:'running'}:{id:'job-1',state:'succeeded',fileUrl:'/api/export-jobs/job-1/file.pptx'}),{headers:{'Content-Type':'application/json'}});
  if(url==='/api/export-jobs/job-1/file.pptx')return new Response(new Uint8Array([0x50,0x4b,0x03,0x04,1,2,3]),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.presentationml.presentation'}});
  return new Response('',{status:404});
 }));
 await downloadPptxExport({id:'job-1',state:'queued'},'经营月报',{pollIntervalMs:0,timeoutMs:100});
 expect(polls).toBe(2);
 expect(clicks).toEqual(['经营月报.pptx|blob:pptx']);
 expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pptx');
});

it('does not download a failed or malformed export',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({id:'job-2',state:'failed',errorDetail:{message:'生成失败'}}),{headers:{'Content-Type':'application/json'}})));
 await expect(downloadPptxExport({id:'job-2',state:'queued'},'文稿',{pollIntervalMs:0,timeoutMs:100})).rejects.toThrow('生成失败');
});
