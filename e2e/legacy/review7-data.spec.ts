import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';

test('模板预览只展示当前模板使用的数据表和查询口径',async({page,request})=>{
 const templates=(await(await request.get('/api/templates')).json()).items;
 const template=templates.find((t:any)=>t.id==='budget-comparison');
 await page.goto('/library');
 const response=page.waitForResponse(r=>r.url().endsWith('/templates/budget-comparison')&&r.request().method()==='GET');
 await page.getByRole('button',{name:`预览 ${template.name}`,exact:true}).click();
 const result=await(await response).json();
 expect(result.example.dataSpec.resultSets.map((r:any)=>r.id)).toEqual(['budget']);
 expect(result.example.dataSpec.queries).toHaveLength(1);
 const dialog=page.getByRole('dialog',{name:template.name,exact:true});
 await expect(dialog.locator('.actual-preview svg')).toBeVisible();
 await expect(dialog.locator('.template-data-table .table-scroll')).toHaveCount(1);
 const fixture=await(await request.get('/api/fixtures/monthly-operations')).json();
 for(const rs of fixture.resultSets.filter((r:any)=>r.id!=='budget'))await expect(dialog.getByRole('heading',{name:new RegExp(rs.name||rs.id)})).toHaveCount(0);
});

test('数据按模板输入拆分，同ID修订历史，显式复制，引用锁定和未引用删除',async({page,request})=>{
 const name=`输入拆分验收-${randomUUID().slice(0,8)}`;const ids:string[]=[];let sid='';
 try{
  const fixture=await(await request.get('/api/fixtures/monthly-operations')).json();
  await page.goto('/data');await page.getByRole('button',{name:'新增数据集',exact:true}).click();
  await page.getByLabel('数据集名称',{exact:true}).fill(name);
  await page.getByRole('textbox',{name:'DataSpec JSON',exact:true}).fill(JSON.stringify(fixture));
  await page.getByRole('combobox',{name:'多表导入方式',exact:true}).selectOption('split');
  const splitResponse=page.waitForResponse(r=>r.url().endsWith('/datasets/split-import')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'校验并保存当前数据',exact:true}).click();
  const response=await splitResponse;expect(response.ok(),await response.text()).toBe(true);
  const children=(await response.json()).items;ids.push(...children.map((d:any)=>d.id));
  expect(children).toHaveLength(fixture.resultSets.length);
  expect(children.every((d:any)=>d.dataSpec.resultSets.length===1)).toBe(true);
  await expect(page.getByText(`已按模板输入拆分为 ${children.length} 份数据，可分别维护与选择模板。`,{exact:true})).toBeVisible();
  const budget=children.find((d:any)=>d.dataSpec.resultSets[0].id==='budget');
  await page.getByLabel('搜索数据集').fill(budget.name);
  await page.getByRole('button',{name:`预览 ${budget.name}`,exact:true}).click();
  let dialog=page.getByRole('region',{name:'数据维护'});await expect(dialog.locator('.table-scroll').first()).toBeVisible();
  await dialog.getByRole('heading',{name:budget.name,exact:true}).dblclick();await dialog.getByLabel('修改名称',{exact:true}).fill(name+'预算订正');await dialog.getByLabel('修改名称',{exact:true}).press('Enter');
  const field=budget.dataSpec.resultSets[0].fields.find((f:any)=>f.id==='actual');await dialog.getByLabel(`budget 第1行 ${field.name||field.id}`,{exact:true}).fill('14000000');
  const updateResponse=page.waitForResponse(r=>r.url().endsWith(`/datasets/${budget.id}`)&&r.request().method()==='PUT');await dialog.getByRole('button',{name:'保存数据',exact:true}).click();expect((await(await updateResponse).json()).version).toBe(2);
  const saved=await(await request.get(`/api/datasets/${budget.id}`)).json();expect(saved.id).toBe(budget.id);expect(saved.origin).toEqual(budget.origin);expect(saved.name).toBe(name+'预算订正');
  await dialog.getByRole('button',{name:'历史版本',exact:true}).click();await expect(dialog.locator('.version-row')).toHaveCount(2);
  const copyResponse=page.waitForResponse(r=>r.url().endsWith(`/datasets/${budget.id}/copy`)&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'复制数据',exact:true}).click();const copy=await(await copyResponse).json();ids.push(copy.id);expect(copy.id).not.toBe(budget.id);expect(copy.version).toBe(1);
  await expect(dialog.getByRole('heading',{name:copy.name,exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'删除数据',exact:true})).toBeEnabled();
  await dialog.getByRole('button',{name:'删除数据',exact:true}).click();await dialog.getByRole('button',{name:'确认删除数据',exact:true}).click();await expect(page.getByRole('status')).toContainText('已删除 1 份数据。');
  const created=await request.post('/api/slides',{headers:{'Idempotency-Key':randomUUID()},data:{datasetId:budget.id,templateId:'budget-comparison'}});expect(created.ok(),await created.text()).toBe(true);sid=(await created.json()).id;
  await page.getByLabel('搜索数据集').fill(saved.name);await page.getByRole('button',{name:`预览 ${saved.name}`,exact:true}).click();dialog=page.getByRole('region',{name:'数据维护'});
  await expect(dialog.getByRole('button',{name:'删除数据',exact:true})).toBeDisabled();await expect(dialog.getByRole('button',{name:'删除数据',exact:true})).toHaveAttribute('title','已被引用，不能删除');await expect(dialog.getByRole('button',{name:'删除数据',exact:true}).locator('svg')).toBeVisible();
  const denied=await request.delete(`/api/datasets/${budget.id}`,{headers:{'If-Match':String(saved.version)}});expect(denied.status()).toBe(409);expect((await denied.json()).code).toBe('DATASET_IN_USE');
  await expect(dialog.locator('.actual-preview svg')).toBeVisible();await page.screenshot({path:'backend/var/verification/review7-data-references.png',fullPage:true});
 }finally{
  if(sid){const archived=await request.post(`/api/slides/${sid}/archive`,{data:{}});expect(archived.ok(),await archived.text()).toBe(true)}
  const remaining=(await(await request.get('/api/datasets')).json()).items.filter((d:any)=>ids.includes(d.id)||d.name.startsWith(name));
  for(const item of remaining){const current=await request.get(`/api/datasets/${item.id}`);expect(current.ok(),await current.text()).toBe(true);const d=await current.json();const deleted=await request.delete(`/api/datasets/${d.id}`,{headers:{'If-Match':String(d.version)}});expect(deleted.ok(),await deleted.text()).toBe(true)}
  expect((await(await request.get('/api/datasets')).json()).items.filter((d:any)=>ids.includes(d.id)||d.name.startsWith(name))).toHaveLength(0);
 }
});
