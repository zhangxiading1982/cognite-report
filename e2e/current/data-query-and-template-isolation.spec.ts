import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {scopeDataSpec} from '../../backend/src/data-scope';

test('模板样例包含业务解释，独立于数据管理的修改和删除',async({page,request})=>{
 const original=await(await request.post('/api/templates/budget-comparison/preview',{data:{}})).json();
 const name=`独立模板验收-${randomUUID().slice(0,8)}`;
 const made=await request.post('/api/datasets',{data:{name,dataSpec:original.dataSpec,templateIds:['budget-comparison'],tags:{用途:['模板样本']}}});expect(made.ok()).toBe(true);const dataset=await made.json();
 try{
 const data=structuredClone(dataset.dataSpec);data.resultSets[0].rows[0].actual='99000000';
 const edit=await request.put(`/api/datasets/${dataset.id}`,{headers:{'If-Match':'1'},data:{name:name+'修订',dataSpec:data}});expect(edit.ok()).toBe(true);
 const remove=await request.delete(`/api/datasets/${dataset.id}`,{headers:{'If-Match':'2'}});expect(remove.ok()).toBe(true);
 const again=await(await request.post('/api/templates/budget-comparison/preview',{data:{}})).json();expect(again.example).toEqual(original.example);
 await page.goto('/library');await page.getByRole('button',{name:'目录 图表分析',exact:true}).click();await page.getByRole('button',{name:'预览 预算对比',exact:true}).click();const dialog=page.getByRole('dialog',{name:'预算对比',exact:true});
 await expect(dialog.locator('.actual-preview svg')).toBeVisible();await expect(dialog).toContainText('业务背景与适用场景');await expect(dialog.getByRole('textbox',{name:'业务背景',exact:true})).toHaveValue(original.example.businessContext.background);
 await expect(dialog.getByRole('combobox')).toHaveCount(0);await expect(dialog.locator('.model-summary')).toHaveCount(0);
 await expect(dialog.locator('.schema-summary')).toHaveCount(0);await expect(dialog.getByRole('table')).toHaveCount(original.dataSpec.resultSets.length);await dialog.getByRole('button',{name:/编辑字段/}).first().click();await expect(page.getByText(/^字段标识：/)).toBeVisible();await page.getByRole('button',{name:'关闭字段设置',exact:true}).click();
 await dialog.locator('.modal-body').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:'backend/var/verification/review8-template-independent.png'});
 }finally{await cleanupDataset(request,dataset.id)}
});

test('一份图表数据维护命名多查询与模型，修改保留同ID历史并通过Mock刷新',async({page,request})=>{
 const name=`多查询验收-${randomUUID().slice(0,8)}`;
 const data=scopeDataSpec(await(await request.get('/api/fixtures/monthly-operations')).json(),['budget','trend']);
 const refreshConfig={mode:'biStudioMock',chartId:'chart-demo-budget',queries:[{id:'query-budget',name:'预算明细',language:'dax',text:'EVALUATE mock',modelId:'operations-demo',resultSetId:'budget',role:'detail',chartGroup:'main'},{id:'query-trend',name:'时间小计',language:'dax',text:'EVALUATE mock',modelId:'operations-demo',resultSetId:'trend',role:'rowSubtotal',chartGroup:'main'}]};
 const made=await request.post('/api/datasets/bi-import',{data:{name,chartId:'chart-demo-budget',splitInputs:false,preserveResultSets:true}});expect(made.ok(),await made.text()).toBe(true);let dataset=await made.json();
 try{const configured=await request.put(`/api/datasets/${dataset.id}`,{headers:{'If-Match':String(dataset.version)},data:{name,dataSpec:{...data,source:dataset.dataSpec.source},refreshConfig}});expect(configured.ok(),await configured.text()).toBe(true);dataset=await configured.json();
  await page.goto('/data');await page.getByLabel('搜索数据集').fill(name);await page.getByRole('button',{name:`预览 ${name}`,exact:true}).click();let dialog=page.getByRole('region',{name:'数据维护'});
  await expect(dialog.locator('.data-query-placeholder fieldset')).toHaveCount(2);await expect(dialog.locator('.model-summary')).toHaveCount(0);
  await expect(dialog.locator('.data-query-placeholder')).toHaveCount(2);
  for(const section of await dialog.locator('.data-query-placeholder').all())await section.locator('summary').click();
  const baseline=await(await request.get(`/api/datasets/${dataset.id}`)).json();
  expect(baseline.origin.kind).toBe('biStudio');
  const queries=dialog.locator('.data-query-placeholder fieldset');await queries.nth(0).getByLabel('查询名称',{exact:true}).fill('区域预算明细');await queries.nth(1).getByLabel('查询名称',{exact:true}).fill('月度汇总');
  await queries.nth(1).getByRole('combobox',{name:'查询角色',exact:true}).selectOption('grandTotal',{timeout:5000});
  await expect(queries.nth(0).getByRole('textbox',{name:'模型 ID',exact:true})).toHaveValue('operations-demo');
  await expect(queries.nth(1).getByRole('textbox',{name:'DAX 查询',exact:true})).toHaveValue('EVALUATE mock');
  const saving=page.waitForResponse(r=>r.url().endsWith(`/datasets/${dataset.id}`)&&r.request().method()==='PUT');
  await dialog.getByRole('button',{name:'保存数据',exact:true}).click();const savedResponse=await saving;expect(savedResponse.ok(),await savedResponse.text()).toBe(true);await expect(dialog.getByRole('button',{name:'保存数据',exact:true})).toBeDisabled();
  dataset=await(await request.get(`/api/datasets/${dataset.id}`)).json();expect(dataset.version).toBe(baseline.version+1);expect(dataset.dataSpec.resultSets).toHaveLength(2);expect(dataset.refreshConfig.queries.map((q:any)=>q.name)).toEqual(['区域预算明细','月度汇总']);expect(dataset.refreshConfig.queries[1].role).toBe('grandTotal');
  const snapshot=dataset.currentSnapshotId;
  await request.post('/api/mock-bi/charts/chart-demo-budget/advance',{data:{scenario:'increase'}});
  await dialog.getByRole('button',{name:'刷新模拟数据',exact:true}).click();const refreshing=page.waitForResponse(r=>r.url().endsWith(`/datasets/${dataset.id}/refresh`)&&r.request().method()==='POST');await dialog.getByRole('button',{name:'确认恢复',exact:true}).click();const refreshResponse=await refreshing;expect(refreshResponse.ok(),await refreshResponse.text()).toBe(true);
  await expect.poll(async()=>{const d=await(await request.get(`/api/datasets/${dataset.id}`)).json();return d.version}).toBe(baseline.version+2);
  const refreshed=await(await request.get(`/api/datasets/${dataset.id}`)).json();expect(refreshed.id).toBe(dataset.id);expect(refreshed.currentSnapshotId).not.toBe(snapshot);expect(refreshed.dataSpec.resultSets).toHaveLength(2);expect(refreshed.refreshConfig.queries.map((q:any)=>q.name)).toEqual(['区域预算明细','月度汇总']);
  await dialog.getByRole('button',{name:'历史版本',exact:true}).click();await expect(dialog.locator('.version-row')).toHaveCount(baseline.version+2);
  await dialog.locator('.data-query-placeholder').first().scrollIntoViewIfNeeded();await page.screenshot({path:'backend/var/verification/review8-multi-query.png'});
 }finally{try{const recovered=await request.post('/api/mock-bi/charts/chart-demo-budget/advance',{data:{scenario:'recover'}});expect(recovered.ok(),await recovered.text()).toBe(true)}finally{await cleanupDataset(request,dataset.id)}}
});

async function cleanupDataset(request:any,id:string){
 const current=await request.get(`/api/datasets/${id}`);if(!current.ok()){expect(current.status()).toBe(404);return}
 const data=await current.json();if(!data.archivedAt){const removed=await request.delete(`/api/datasets/${id}`,{headers:{'If-Match':String(data.version)}});expect(removed.ok(),await removed.text()).toBe(true)}
 const archived=await request.get(`/api/datasets/${id}`);if(archived.ok())expect((await archived.json()).archivedAt).toBeTruthy();else expect(archived.status()).toBe(404);
 const list=await request.get('/api/datasets');expect(list.ok()).toBe(true);expect((await list.json()).items.some((d:any)=>d.id===id)).toBe(false);
}
