import {api} from './api';

type ExportJob={
 id:string;
 state?:string;
 status?:string;
 fileUrl?:string|null;
 error?:unknown;
 errorCode?:string;
 errorDetail?:{message?:string}|null;
};

const PPTX_MIME='application/vnd.openxmlformats-officedocument.presentationml.presentation';

export function pptxFilename(title:string){
 const withoutExtension=String(title||'').replace(/\.pptx$/i,'');
 const safe=withoutExtension.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').trim().slice(0,100);
 return `${safe||'Slide Report 文稿'}.pptx`;
}

function stateOf(job:ExportJob){return job.state||job.status||'';}
function failureMessage(job:ExportJob){
 return job.errorDetail?.message||(typeof job.error==='string'?job.error:undefined)||job.errorCode||'PPTX 生成失败，请重试';
}
const wait=(milliseconds:number)=>new Promise<void>(resolve=>setTimeout(resolve,milliseconds));

export async function downloadPptxExport(initial:ExportJob,title:string,options:{pollIntervalMs?:number;timeoutMs?:number}={}){
 if(!initial?.id)throw new Error('导出任务创建失败');
 const pollIntervalMs=options.pollIntervalMs??500,timeoutMs=options.timeoutMs??120_000,started=Date.now();
 let job=initial;
 while(!['succeeded','completed'].includes(stateOf(job))){
  if(['failed','cancelled','canceled'].includes(stateOf(job)))throw new Error(failureMessage(job));
  if(Date.now()-started>=timeoutMs)throw new Error('PPTX 生成超时，请稍后在导出记录中下载');
  if(pollIntervalMs)await wait(pollIntervalMs);
  job=await api<ExportJob>(`/export-jobs/${initial.id}`);
 }
 const fileUrl=job.fileUrl||`/api/export-jobs/${initial.id}/file.pptx`;
 const response=await fetch(fileUrl);
 if(!response.ok)throw new Error(`PPTX 下载失败 (${response.status})`);
 const type=response.headers.get('Content-Type')?.split(';')[0]?.trim();
 if(type!==PPTX_MIME)throw new Error('下载文件不是有效的 PowerPoint 文件');
 const bytes=await response.arrayBuffer(),signature=new Uint8Array(bytes,0,Math.min(4,bytes.byteLength));
 if(bytes.byteLength<4||signature[0]!==0x50||signature[1]!==0x4b||signature[2]!==0x03||signature[3]!==0x04)throw new Error('PPTX 文件校验失败，请重新导出');
 const url=URL.createObjectURL(new Blob([bytes],{type:PPTX_MIME}));
 const anchor=document.createElement('a');
 anchor.href=url;anchor.download=pptxFilename(title);anchor.hidden=true;
 document.body.append(anchor);
 try{anchor.click();}finally{anchor.remove();URL.revokeObjectURL(url);}
 return job;
}
