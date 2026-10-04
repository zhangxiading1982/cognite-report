import {scopeDataSpec} from '../backend/src/data-scope';
import {createdContent} from './content-helpers';
import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import JSZip from 'jszip';

test('图表数据修改结果字段、数值与扩展标签，模板样例保持独立',async({page,request})=>{
 const initialName=`统一数据验收-${randomUUID().slice(0,6)}`;let sid='',contentId='';
 const fixture=scopeDataSpec(await(await request.get('/api/fixtures/monthly-operations')).json(),['budget']);
 const created=await request.post('/api/datasets',{data:{name:initialName,dataSpec:fixture,tags:{用途:['模板样本']},templateIds:['budget-comparison']}});
 expect(created.ok()).toBe(true);const dataset=await created.json();
 try{
  await page.goto('/samples');await expect(page).toHaveURL(/\/data$/);
  await expect(page.getByRole('navigation').getByRole('button',{name:'样本数据',exact:true})).toHaveCount(0);
  await page.getByLabel('搜索数据集').fill(initialName);
  await page.getByRole('button',{name:'查看数据与口径',exact:true}).click();
  await page.getByRole('button',{name:'编辑数据',exact:true}).click();
  await page.getByLabel('数据集名称').fill(initialName+'修订');
  await page.getByRole('checkbox',{name:'页面数据',exact:true}).check();
  await page.getByLabel('新标签类型').fill('行业');await page.getByLabel('新标签值').fill('零售');
  await page.getByRole('button',{name:'添加标签',exact:true}).click();
  await page.getByLabel('结果集 budget 名称').fill('地区预算');
  await page.getByLabel('结果字段 actual 名称').fill('订正实际');
  await page.getByLabel('budget 第1行 订正实际',{exact:true}).fill('14000000');
  await page.getByLabel('结果字段 regionName 名称',{exact:true}).fill('地区显示名称');
  await page.getByRole('button',{name:'校验并保存当前数据',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('当前数据 v2');
  await expect(page.getByRole('dialog')).toContainText('行业：零售');
  await expect(page.getByRole('dialog').getByRole('columnheader',{name:/^地区显示名称/})).toBeVisible();
  const saved=await(await request.get(`/api/datasets/${dataset.id}`)).json();
  expect(saved.tags.用途).toEqual(['模板样本','页面数据']);expect(saved.tags.行业).toEqual(['零售']);
  expect(saved.dataSpec.resultSets[0].fields[2].name).toBe('订正实际');
  expect(saved.dataSpec.resultSets[0].rows[0].actual).toBe('14000000');
  expect(saved.origin).toEqual(dataset.origin);
  const samplePreview=await request.post('/api/templates/budget-comparison/preview',{data:{}});
  expect(samplePreview.ok()).toBe(true);expect((await samplePreview.json()).dataSpec.resultSets[0].rows[0].actual).toBe(fixture.resultSets[0].rows[0].actual);
  await page.getByRole('dialog').getByRole('combobox',{name:'适合的图表类型',exact:true}).selectOption('budget-comparison');
  await expect(page.locator('.actual-preview')).toContainText('300万元');
  await page.getByRole('button',{name:'使用此模板创建页面'}).click();
  ({slideId:sid,contentId}=await createdContent(page,request));
  await expect(page.locator('.svg-content')).toContainText('300万元');
  expect((await(await request.get(`/api/slides/${sid}/lineage`)).json()).dataset.id).toBe(dataset.id);
  await page.goto('/data');await page.getByLabel('标签类型筛选').selectOption('行业');await page.getByLabel('标签值筛选').selectOption('零售');
  await expect(page.locator('.list')).toContainText(initialName+'修订');
  await page.screenshot({path:'backend/var/verification/review3-data.png'});
 }finally{if(contentId)await request.post(`/api/contents/${contentId}/archive`,{data:{}});else if(sid)await request.post(`/api/slides/${sid}/archive`,{data:{}})}
});

test('图片库：SVG上传维护、编辑器选用、归档后重开与真实PPT下载',async({page,request})=>{
 const name=`SVG验收-${randomUUID().slice(0,6)}`;let sid='',aid='';
 try{
  await page.goto('/assets');
  await expect(page.getByRole('button',{name:'预览 业务增长',exact:true})).toBeVisible();
  await page.getByLabel('上传素材种类').selectOption('icon');
  await page.getByLabel('上传素材文件').setInputFiles({name:name+'.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" viewBox="0 0 160 80"><rect width="160" height="80" rx="12" fill="#146b52"/><path d="M30 55L70 30L100 45L130 15" fill="none" stroke="#ffffff" stroke-width="6"/></svg>')});
  const detail=page.getByRole('dialog',{name:'素材详情'});
  await expect(detail.locator('img')).toBeVisible();
  await detail.getByLabel('素材名称',{exact:true}).fill(name);
  await detail.getByLabel('素材标签（逗号分隔）').fill('验收, 业务');
  await detail.getByRole('button',{name:'保存素材信息'}).click();
  await detail.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByLabel('搜索图片').fill(name);
  await expect(page.locator('.media-card')).toContainText('验收 / 业务');
  const asset=(await(await request.get('/api/assets')).json()).items.find((a:any)=>a.name===name);aid=asset.id;
  expect(asset.originalMime).toBe('image/svg+xml');
  const fixture=scopeDataSpec(await(await request.get('/api/fixtures/monthly-operations')).json(),['budget']);
  const created=await request.post('/api/slides/from-import',{headers:{'Idempotency-Key':randomUUID()},data:{dataSpec:fixture,templateId:'budget-comparison',title:name}});
  expect(created.ok()).toBe(true);sid=(await created.json()).id;
  await page.goto(`/slides/${sid}`);await page.getByRole('button',{name:'图片',exact:true}).click();
  await page.getByLabel('搜索图片').fill(name);await page.getByRole('button',{name:`插入 ${name}`,exact:true}).click();
  await expect(page.locator('.svg-content image')).toHaveCount(1);
  await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.save-status')).toContainText('已保存');
  expect((await request.post(`/api/assets/${aid}/archive`,{data:{}})).ok()).toBe(true);
  await page.reload();await expect(page.locator('.svg-content image')).toHaveCount(1);
  await page.getByRole('button',{name:'确认结论已复核',exact:true}).click();
  await page.getByRole('button',{name:'导出 PPT',exact:true}).click();await page.getByRole('button',{name:'生成 PPT',exact:true}).click();
  const link=page.getByRole('link',{name:'下载 PPTX',exact:true}).first();await expect(link).toBeVisible({timeout:20000});
  const [download]=await Promise.all([page.waitForEvent('download'),link.click()]);expect(await download.failure()).toBeNull();expect(download.suggestedFilename()).toMatch(/\.pptx$/);
  expect(await link.getAttribute('href')).toMatch(/\/file\.pptx$/);
  await download.saveAs('backend/var/verification/review4-download.pptx');
  const response=await request.get((await link.getAttribute('href'))!);const zip=await JSZip.loadAsync(await response.body());
  const preview=await(await request.get(asset.url)).body();const media=await Promise.all(zip.file(/ppt\/media\/.*\.png$/).map(f=>f.async('nodebuffer')));
  expect(media.some(bytes=>bytes.equals(preview))).toBe(true);
  await page.goto('/assets');await page.getByLabel('搜索图片').fill(name);await expect(page.locator('.media-card')).toHaveCount(0);
  await page.getByLabel('搜索图片').fill('');await page.getByLabel('素材来源').selectOption('builtin');
  await page.screenshot({path:'backend/var/verification/review3-assets.png'});
 }finally{if(sid)await request.post(`/api/slides/${sid}/archive`,{data:{}});if(aid)await request.post(`/api/assets/${aid}/archive`,{data:{}})}
});
