import {scopeDataSpec} from '../backend/src/data-scope';
import {test,expect,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';

test('数据管理：人工订正、图表预览、页面溯源与回滚',async({page,request})=>{
 const name=`数据验收-${randomUUID().slice(0,6)}`;let slideId='';
 try{
  const fixture=scopeDataSpec(await(await request.get('/api/fixtures/monthly-operations')).json(),['budget']);
  await page.goto('/data');
  await page.getByRole('button',{name:'新增数据集',exact:true}).click();
  await page.getByLabel('数据集名称').fill(name);
  await page.getByRole('textbox',{name:'DataSpec JSON',exact:true}).fill(JSON.stringify(fixture));
  await page.getByRole('button',{name:'校验并保存当前数据'}).click();
  let dialog=page.getByRole('region',{name:'数据维护'});
  await expect(dialog.getByRole('heading',{name:'数据集',exact:true})).toBeVisible();
  fixture.resultSets[0].rows[0].actual='14000000';
  await dialog.getByRole('heading',{name,exact:true}).dblclick();await dialog.getByLabel('修改名称',{exact:true}).fill(name+'订正');await dialog.getByLabel('修改名称',{exact:true}).press('Enter');
  const actual=fixture.resultSets[0].fields.find((f:any)=>f.id==='actual')!;await dialog.getByLabel(`budget 第1行 ${actual.name||actual.id}`,{exact:true}).fill('14000000');
  const savedResponse=page.waitForResponse(r=>r.url().includes('/api/datasets/')&&r.request().method()==='PUT');await dialog.getByRole('button',{name:'保存数据',exact:true}).click();const saved=await(await savedResponse).json();expect(saved.version).toBe(2);
  await dialog.getByRole('combobox',{name:'适合的图表类型',exact:true}).selectOption('budget-comparison');
  await expect(dialog.locator('.actual-preview svg')).toBeVisible();
  await expect(dialog.locator('.actual-preview')).toContainText('300万元');
  await expect(dialog.getByRole('button',{name:/使用.*创建页面/})).toHaveCount(0);
  const created=await request.post('/api/slides',{headers:{'Idempotency-Key':randomUUID()},data:{datasetId:saved.id,templateId:'budget-comparison'}});expect(created.ok()).toBe(true);slideId=(await created.json()).id;await page.goto(`/slides/${slideId}`);
  await expect(page.locator('.svg-content')).toContainText('300万元');
  await page.getByRole('button',{name:/查看数据来源/}).click();dialog=page.getByRole('dialog');
  await expect(dialog).toContainText(name+'订正');
  await expect(dialog).toContainText('数据版本 2');
  await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  const linked=await(await request.get(`/api/slides/${slideId}/lineage`)).json();
  const rolled=await request.post(`/api/datasets/${linked.dataset.id}/rollback`,{headers:{'If-Match':'2'},data:{version:1}});
  expect(rolled.ok()).toBe(true);
  await page.getByRole('button',{name:'检查当前数据',exact:true}).click();
  await expect(page.locator('.svg-content')).toContainText('100万元');
  await expect(page.locator('.dataset-line')).toContainText(name);
  await page.screenshot({path:'backend/var/verification/review2-editor.png',fullPage:true});
 }finally{if(slideId){const archived=await request.post(`/api/slides/${slideId}/archive`,{data:{}});expect(archived.ok(),await archived.text()).toBe(true)}await removeTestDatasets(request,name)}
});

test('模拟BI：连接、源端变化更新页面、故障保留当前数据与恢复',async({page,request})=>{
 const name=`模拟验收-${randomUUID().slice(0,6)}`;let slideId='';
 try{
  await page.goto('/data');
  await page.getByRole('button',{name:'新增数据集',exact:true}).click();
  await page.getByRole('combobox',{name:'导入方式',exact:true}).selectOption('bi');
  await page.getByLabel('数据集名称').fill(name);
  await page.getByLabel('图表 chartId').fill('chart-demo-trend');
  await page.getByRole('button',{name:'连接并导入'}).click();
  await expect(page.getByRole('region',{name:'数据维护'})).toContainText('BI Studio · Mock');await page.getByRole('region',{name:'数据维护'}).getByRole('button',{name:'关闭',exact:true}).click();
  const data=(await(await request.get('/api/datasets')).json()).items.find((d:any)=>d.name.startsWith(name)&&d.dataSpec.resultSets.some((r:any)=>r.id==='trend'));
  await page.getByLabel('搜索数据集').fill(data.name);await page.getByRole('button',{name:`预览 ${data.name}`,exact:true}).click();
  let dialog=page.getByRole('region',{name:'数据维护'});
  await expect(dialog).toContainText('BI Studio · Mock');await expect(dialog.locator('.template-data-table')).toHaveCount(data.dataSpec.resultSets.length);
  const created=await request.post('/api/slides',{headers:{'Idempotency-Key':randomUUID()},data:{datasetId:data.id,templateId:'monthly-trend'}});
  expect(created.ok()).toBe(true);slideId=(await created.json()).id;
  await page.goto(`/slides/${slideId}`);
  await expect(page.locator('.svg-content svg')).toBeVisible();
  await request.post('/api/mock-bi/charts/chart-demo-trend/advance',{data:{scenario:'increase'}});
  // Explicit refresh bypasses background check cache.
  expect((await request.post(`/api/datasets/${data.id}/refresh`,{headers:{'If-Match':'1'},data:{}})).ok()).toBe(true);
  await page.getByRole('button',{name:'检查当前数据',exact:true}).click();
  await expect.poll(async()=>{const s=await(await request.get(`/api/slides/${slideId}`)).json();return s.extensions.dataset.version}).toBe(2);
  const latest=await(await request.get(`/api/datasets/${data.id}`)).json();
  expect(latest.dataSpec.resultSets.find((r:any)=>r.id==='trend').rows[0].revenue).not.toBe(data.dataSpec.resultSets.find((r:any)=>r.id==='trend').rows[0].revenue);
  await request.post('/api/mock-bi/charts/chart-demo-trend/advance',{data:{scenario:'fail'}});
  expect((await request.post(`/api/datasets/${data.id}/refresh`,{headers:{'If-Match':'2'},data:{}})).status()).toBe(503);
  expect((await(await request.get(`/api/datasets/${data.id}`)).json()).currentSnapshotId).toBe(latest.currentSnapshotId);
  await request.post('/api/mock-bi/charts/chart-demo-trend/advance',{data:{scenario:'recover'}});
  expect((await request.post(`/api/datasets/${data.id}/refresh`,{headers:{'If-Match':'2'},data:{}})).ok()).toBe(true);
  await page.getByRole('button',{name:/查看数据来源/}).click();dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('数据版本 2');
  await expect(dialog).toContainText('chart-demo-trend');
 }finally{await request.post('/api/mock-bi/charts/chart-demo-trend/advance',{data:{scenario:'recover'}});if(slideId){const archived=await request.post(`/api/slides/${slideId}/archive`,{data:{}});expect(archived.ok(),await archived.text()).toBe(true)}await removeTestDatasets(request,name)}
});


async function removeTestDatasets(request:APIRequestContext,name:string){
 const listed=await request.get('/api/datasets');expect(listed.ok(),await listed.text()).toBe(true);
 for(const item of (await listed.json()).items.filter((d:any)=>d.name.startsWith(name))){
  const current=await request.get(`/api/datasets/${item.id}`);expect(current.ok(),await current.text()).toBe(true);const d=await current.json();
  const deleted=await request.delete(`/api/datasets/${d.id}`,{headers:{'If-Match':String(d.version)}});expect(deleted.ok(),await deleted.text()).toBe(true);
 }
 const remaining=(await(await request.get('/api/datasets')).json()).items;expect(remaining.filter((d:any)=>d.name.startsWith(name))).toHaveLength(0);
}
