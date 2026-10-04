import {scopeDataSpec} from '../../backend/src/data-scope';
import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('模板真实缩略图、固定模板预览和顶部大图',async({page,request})=>{
 await page.goto('/library');
 const name='区域收入圆环图';
 const thumbnail=page.getByRole('button',{name:`预览 ${name}`,exact:true});
 await thumbnail.scrollIntoViewIfNeeded();
 await expect(thumbnail.locator('svg')).toBeVisible();
 const thumbSvg=await thumbnail.locator('svg').evaluate(el=>el.outerHTML);
 await thumbnail.click();
 const dialog=page.getByRole('dialog',{name,exact:true});
 await expect(dialog.locator('.actual-preview svg')).toBeVisible();
 expect(await dialog.locator('.actual-preview svg').evaluate(el=>el.outerHTML)).toBe(thumbSvg);
 await expect(dialog.getByText('选择模板',{exact:true})).toHaveCount(0);
 await expect(dialog.getByText('模板数据',{exact:true})).toBeVisible();
 const chart=await dialog.locator('.actual-preview').boundingBox();
 const spec=await dialog.getByText('模板数据',{exact:true}).boundingBox();
 expect(chart!.y+chart!.height).toBeLessThanOrEqual(spec!.y);
 await expect(dialog.getByRole('table')).toHaveCount(1);
 await expect(dialog.getByRole('button',{name:'全屏预览',exact:true})).toBeVisible();
 await page.screenshot({path:'backend/var/verification/review6-template-preview.png',fullPage:true});
});
test('数据详情优先显示表格和字段浮层，支持切换匹配图表预览',async({page,request})=>{
 const name=`数据匹配验收-${randomUUID().slice(0,6)}`;
 const fixture=scopeDataSpec(await(await request.get('/api/fixtures/monthly-operations')).json(),['trend']);
 const created=await request.post('/api/datasets',{data:{name,dataSpec:fixture,tags:{用途:['页面数据']},templateIds:['monthly-trend']}});
 expect(created.ok()).toBe(true);const dataset=await created.json();
 try{
 await page.goto('/data');await page.getByLabel('搜索数据集').fill(name);
 await page.getByRole('button',{name:`预览 ${name}`,exact:true}).click();
 const dialog=page.getByRole('region',{name:'数据维护'});
 await expect(dialog.locator('.table-scroll').first()).toBeVisible();
 await expect(dialog.locator('.schema-summary')).toHaveCount(0);
 await expect(dialog.getByRole('heading',{name:'数据集',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:/编辑字段/}).first()).toBeVisible();
 const selector=dialog.getByRole('combobox',{name:'适合的图表类型',exact:true});
 await expect(selector).toHaveValue('monthly-trend');
 await expect(dialog.locator('.actual-preview svg')).toBeVisible();
 const matches=(await(await request.get(`/api/datasets/${dataset.id}/templates`)).json()).items.filter((m:any)=>m.status==='matched');
 expect(matches.length).toBeGreaterThan(1);
 const alternative=matches.find((m:any)=>m.templateId!=='monthly-trend');
 await selector.selectOption(alternative.templateId);
 await expect(dialog.locator('.actual-preview svg')).toBeVisible();
 await expect(dialog).toContainText(name);
 await dialog.getByRole('button',{name:/编辑字段/}).first().click();
 await expect(page.getByRole('combobox',{name:'字段类型',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'关闭字段设置',exact:true}).click();
 await expect(dialog.locator('.model-summary')).toHaveCount(0);
 await page.screenshot({path:'backend/var/verification/review6-data-preview.png',fullPage:true});
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('button',{name:'新增数据集',exact:true}).click();
 await page.getByRole('combobox',{name:'从模板数据格式开始',exact:true}).selectOption('budget-comparison');
 await expect(page.getByRole('textbox',{name:'DataSpec JSON',exact:true})).not.toBeEmpty();
 await expect(page.getByLabel('数据集名称',{exact:true})).toBeVisible();
 await page.getByRole('region',{name:'数据维护'}).getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('dialog',{name:'保存数据修改？'}).getByRole('button',{name:'放弃修改'}).click();
 }finally{await cleanupDataset(request,dataset.id)}
});

async function cleanupDataset(request:any,id:string){
 const current=await request.get(`/api/datasets/${id}`);if(!current.ok()){expect(current.status()).toBe(404);return}
 const data=await current.json();if(!data.archivedAt){const removed=await request.delete(`/api/datasets/${id}`,{headers:{'If-Match':String(data.version)}});expect(removed.ok(),await removed.text()).toBe(true)}
 const archived=await request.get(`/api/datasets/${id}`);if(archived.ok())expect((await archived.json()).archivedAt).toBeTruthy();else expect(archived.status()).toBe(404);
 const list=await request.get('/api/datasets');expect(list.ok()).toBe(true);expect((await list.json()).items.some((d:any)=>d.id===id)).toBe(false);
}
