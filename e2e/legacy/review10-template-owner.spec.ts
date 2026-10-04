import {test,expect} from '@playwright/test';
import {compileSlide} from '@slidebi/presentation';
import {randomUUID} from 'node:crypto';

test('owner edits independent template sample and archives it without breaking existing pages',async({page,request})=>{
 const name=`模板维护验收-${randomUUID().slice(0,8)}`;let templateId='',datasetId='',contentId='';const slideIds:string[]=[];
 const post=async(path:string,data:any)=>{const response=await request.post(`/api${path}`,{headers:{'Idempotency-Key':randomUUID()},data});expect(response.ok(),await response.text()).toBe(true);return response.json()};
 try{
  const sample=await post('/templates/budget-comparison/preview',{});
  const dataset=await post('/datasets',{name:`${name}-数据`,dataSpec:sample.dataSpec});datasetId=dataset.id;
  const original=await post('/slides',{datasetId,templateId:'budget-comparison',title:`${name}-原页面`});slideIds.push(original.id);
  const template=await post('/templates',{slideId:original.id,name});templateId=template.id;
  const copy=await post('/slides',{datasetId,templateId,title:`${name}-已有引用`});slideIds.push(copy.id);
  const content=await post('/contents',{title:`${name}-文稿`});contentId=content.id;
  await post(`/contents/${contentId}/pages`,{revision:content.revision,slideId:copy.id});
  await page.goto('/library');await page.getByPlaceholder('搜索模板名称').fill(name);
  await page.getByRole('button',{name:`预览 ${name}`,exact:true}).click();
  const dialog=page.getByRole('dialog',{name,exact:true});
  await expect(dialog.locator('.actual-preview svg')).toBeVisible();
  await dialog.getByRole('textbox',{name:'业务背景',exact:true}).fill('经营复盘：解释预算与实际差异。');
  const detail=await(await request.get(`/api/templates/${templateId}`)).json();
  const result=detail.example.dataSpec.resultSets[0];
  const field=result.fields.find((f:any)=>f.id==='actual')||result.fields.find((f:any)=>['decimal','number','integer'].includes(f.type));
  expect(field).toBeTruthy();
  await dialog.getByLabel(`${result.id} 第1行 ${field.name||field.id}`,{exact:true}).fill('777');
  await dialog.getByRole('button',{name:'编辑模板页面',exact:true}).click();
  const canvas=page.getByRole('dialog',{name:'编辑模板页面',exact:true});
  const first=detail.example.slide.elements[0];
  await canvas.getByRole('button',{name:`选择${first.type==='text'?'文字':first.type==='chart'?'图表':'对象'} ${first.id}`,exact:true}).click();
  await canvas.getByLabel('水平位置',{exact:true}).fill('15');
  await canvas.getByRole('button',{name:'完成编辑',exact:true}).click();
  const saving=page.waitForResponse(r=>r.url().endsWith(`/templates/${templateId}`)&&r.request().method()==='PUT');
  await dialog.getByRole('button',{name:'保存模板',exact:true}).click();
  const saveResponse=await saving;expect(saveResponse.ok(),JSON.stringify({response:await saveResponse.json(),diagnostics:compileSlide(saveResponse.request().postDataJSON().example.slide,saveResponse.request().postDataJSON().example.dataSpec,'draft').diagnostics})).toBe(true);
  await expect(dialog.getByRole('button',{name:'保存模板',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  const saved=await(await request.get(`/api/templates/${templateId}`)).json();
  expect(saved.version).toBe(template.version+1);
  expect(saved.example.businessContext.background).toBe('经营复盘：解释预算与实际差异。');
  expect(String(saved.example.dataSpec.resultSets[0].rows[0][field.id])).toBe('777');
  expect(saved.defaultElements[0].rect.x).toBe(15);
  const unchanged=await(await request.get(`/api/datasets/${datasetId}`)).json();
  expect(String(unchanged.dataSpec.resultSets[0].rows[0][field.id])).toBe(String(result.rows[0][field.id]));
  await page.getByRole('button',{name:`预览 ${name}`,exact:true}).click();
  await expect(page.getByRole('dialog',{name,exact:true}).getByRole('textbox',{name:'业务背景',exact:true})).toHaveValue('经营复盘：解释预算与实际差异。');
  await page.getByRole('dialog',{name,exact:true}).getByRole('button',{name:'关闭',exact:true}).click();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:`删除 ${name}`,exact:true}).click();
  await expect(page.getByRole('button',{name:`预览 ${name}`,exact:true})).toHaveCount(0);
  expect((await request.get(`/api/templates/${templateId}`)).status()).toBe(404);
  const old=await(await request.get(`/api/slides/${copy.id}`)).json();old.title='模板归档后仍可保存';
  const update=await request.put(`/api/slides/${copy.id}`,{headers:{'If-Match':String(old.revision)},data:old});expect(update.ok(),await update.text()).toBe(true);
  const deck=await(await request.get(`/api/contents/${contentId}`)).json();
  const preview=await post(`/decks/${contentId}/preview`,{revision:deck.revision,dataPolicy:'snapshot',deliveryMode:'draft'});
  expect(preview.svgs.length).toBeGreaterThan(0);
  const job=await post(`/decks/${contentId}/export`,{revision:deck.revision,previewId:preview.previewId,deliveryMode:'draft'});
  await expect.poll(async()=>{const j=await(await request.get(`/api/export-jobs/${job.id}`)).json();return j.state},{timeout:20000}).toBe('succeeded');
  const finished=await(await request.get(`/api/export-jobs/${job.id}`)).json();expect(finished.fileUrl).toMatch(/\.pptx$/);expect((await request.get(finished.fileUrl)).ok()).toBe(true);
 }finally{
  const results=await Promise.allSettled([
   (async()=>{if(contentId){const response=await request.post(`/api/contents/${contentId}/archive`,{data:{}});expect(response.ok(),await response.text()).toBe(true)}})(),
   ...slideIds.map(async id=>{const response=await request.post(`/api/slides/${id}/archive`,{data:{}});expect(response.ok(),await response.text()).toBe(true)}),
   (async()=>{if(templateId){const current=await request.get(`/api/templates/${templateId}`);if(current.ok()){const response=await request.delete(`/api/templates/${templateId}`,{data:{expectedVersion:(await current.json()).version}});expect(response.ok(),await response.text()).toBe(true)}else expect(current.status()).toBe(404)}})(),
  ]);
  try{if(datasetId)await cleanupDataset(request,datasetId)}finally{for(const result of results)if(result.status==='rejected')throw result.reason}
 }
});

async function cleanupDataset(request:any,id:string){
 const current=await request.get(`/api/datasets/${id}`);if(!current.ok()){expect(current.status()).toBe(404);return}
 const data=await current.json();if(!data.archivedAt){const removed=await request.delete(`/api/datasets/${id}`,{headers:{'If-Match':String(data.version)}});expect(removed.ok(),await removed.text()).toBe(true)}
 const archived=await request.get(`/api/datasets/${id}`);if(archived.ok())expect((await archived.json()).archivedAt).toBeTruthy();else expect(archived.status()).toBe(404);
 const list=await request.get('/api/datasets');expect(list.ok()).toBe(true);expect((await list.json()).items.some((d:any)=>d.id===id)).toBe(false);
}
