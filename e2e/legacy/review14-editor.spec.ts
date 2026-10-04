import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import JSZip from 'jszip';
test('画布文字、全屏与模板默认数据托管后编辑并跨图表同步',async({page,request})=>{
 const ids:string[]=[];let content:any;let datasetId='';
 const post=async(path:string,data:any)=>{const r=await request.post(`/api${path}`,{headers:{'Idempotency-Key':randomUUID()},data});expect(r.ok(),await r.text()).toBeTruthy();return r.json()};
 try{
 const data=await(await request.get('/api/fixtures/monthly-operations')).json();
 const slide=await post('/slides/from-import',{dataSpec:data,templateId:'budget-comparison',title:'Review14画布验收'});ids.push(slide.id);
 content=await post('/contents',{title:`Review14-${randomUUID()}`});content=await post(`/contents/${content.id}/pages`,{revision:content.revision,slideId:slide.id});
 await page.goto(`/contents/${content.id}`);await expect(page.getByLabel('页面名称',{exact:true})).toHaveCount(0);await expect(page.locator('.content-header').getByLabel('文稿标题')).toBeVisible();
 await expect(page.getByText('数据与口径',{exact:true})).toHaveCount(0);await expect(page.getByText('组件片段',{exact:true})).toHaveCount(0);
 const title=slide.elements.find((e:any)=>e.type==='text');await page.getByRole('button',{name:`选择${title.id}`,exact:true}).click();await page.getByLabel('画布文字编辑').fill('在画布中直接修改');await page.getByLabel('画布文字编辑').press('Tab');
 await page.getByRole('button',{name:'全屏编辑页面',exact:true}).click();await expect(page.locator('.editor-fullscreen')).toBeVisible();await expect(page.getByLabel('页面名称',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'退出全屏编辑',exact:true}).click();
 await page.getByRole('button',{name:'图表',exact:true}).click();await page.getByRole('button',{name:'柱形图',exact:true}).click();const panel=page.getByRole('region',{name:'图表数据',exact:true});await expect(panel).toBeVisible();await expect(page.getByText('页面数据 · 未绑定',{exact:true})).toBeVisible();
 await expect(panel.getByText('当前使用模板或页面自带的默认数据；复制到数据管理后才能修改。')).toBeVisible();await expect(panel.getByLabel('table 第1行 数值',{exact:true})).toHaveCount(0);
 await panel.getByLabel('托管数据名称',{exact:true}).fill('Review14独立图表数据');await panel.getByRole('button',{name:'复制到数据管理并编辑'}).click();await expect(panel.getByText('已关联数据管理；修改将同步所有引用图表。')).toBeVisible();
 let saved=await(await request.get(`/api/slides/${slide.id}`)).json();const inserted=saved.elements.find((e:any)=>e.type==='chart'&&e.id!==slide.elements.find((x:any)=>x.type==='chart').id);datasetId=saved.extensions.chartData[inserted.id].datasetId;expect(datasetId).toBeTruthy();
 await panel.getByLabel('table 第1行 数值',{exact:true}).fill('95');await panel.getByLabel('table 第1行 数值',{exact:true}).press('Tab');const published=page.waitForResponse(r=>r.url().endsWith(`/api/datasets/${datasetId}`)&&r.request().method()==='PUT');await panel.getByRole('button',{name:'保存共享数据'}).click();expect((await published).ok()).toBe(true);await expect(panel.getByRole('button',{name:'保存共享数据'})).toBeDisabled();
 expect((await(await request.get(`/api/datasets/${datasetId}`)).json()).dataSpec.resultSets[0].rows[0].f2).toBe('95');
 await page.screenshot({path:'backend/var/verification/review14-chart-data.png'});
 await page.reload();await page.getByRole('button',{name:'选择图表',exact:true}).last().click();await expect(page.getByRole('region',{name:'图表数据'}).getByLabel('table 第1行 数值',{exact:true})).toHaveValue('95');
 const managed=await(await request.get(`/api/datasets/${datasetId}`)).json();managed.dataSpec.resultSets[0].rows[0].f2='105';expect((await request.put(`/api/datasets/${datasetId}`,{headers:{'If-Match':String(managed.version)},data:{name:managed.name,dataSpec:managed.dataSpec}})).ok()).toBe(true);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('region',{name:'图表数据'}).getByLabel('table 第1行 数值',{exact:true})).toHaveValue('105');
 await page.screenshot({path:'backend/var/verification/review14-chart-data.png'});
 await page.getByRole('button',{name:'预览文稿',exact:true}).click();await page.getByRole('button',{name:'确认文稿内容',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);const exported=page.waitForResponse(r=>r.url().endsWith(`/decks/${content.id}/export`)&&r.request().method()==='POST');await page.getByRole('button',{name:'导出 PPT',exact:true}).click();const job=await(await exported).json();const file=page.locator(`a[href="/api/export-jobs/${job.id}/file.pptx"]`);await expect(file).toBeVisible({timeout:20000});const zip=await JSZip.loadAsync(await(await request.get((await file.getAttribute('href'))!)).body());expect(zip.file(/ppt\/slides\/slide\d+\.xml$/)).toHaveLength(1);const charts=await Promise.all(zip.file(/ppt\/charts\/chart\d+\.xml$/).map(f=>f.async('string')));expect(charts.some(xml=>xml.includes('105'))).toBe(true);
 }finally{if(content)await request.post(`/api/contents/${content.id}/archive`,{data:{}});for(const id of ids)await request.post(`/api/slides/${id}/archive`,{data:{}});if(datasetId){const d=await(await request.get(`/api/datasets/${datasetId}`)).json();await request.delete(`/api/datasets/${datasetId}`,{headers:{'If-Match':String(d.version)}})}}
});
