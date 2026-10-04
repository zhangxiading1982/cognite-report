import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('new document offers template samples or a blank page without managed data side effects',async({page,request})=>{
 let id='';
 try{
 await page.goto('/contents');await page.getByRole('textbox',{name:'文稿名称',exact:true}).fill('');
 const created=page.waitForResponse(r=>r.url().endsWith('/api/contents')&&r.request().method()==='POST');await page.getByRole('button',{name:'新建文稿',exact:true}).click();id=(await(await created).json()).id;const dialog=page.getByRole('dialog',{name:'新增页面',exact:true});await expect(dialog).toContainText('新增页面将直接使用模板自带数据');await dialog.getByRole('tab',{name:'空白页'}).click();await dialog.getByRole('textbox',{name:'页面名称'}).fill('空白验证');await dialog.getByRole('button',{name:'添加页面',exact:true}).click();await expect(dialog).toBeHidden();await expect(page.getByLabel('页面名称',{exact:true})).toHaveCount(0);await expect(page.getByRole('complementary',{name:'文稿页面'}).getByText(/空白验证/)).toBeVisible();
 await page.locator('.content-header').getByRole('button',{name:'新增页面',exact:true}).click();await dialog.getByRole('tab',{name:'空白页'}).click();const before=(await(await request.get('/api/datasets?view=chart')).json()).items.length;await dialog.getByRole('button',{name:'添加页面',exact:true}).click();await expect(page.getByRole('complementary',{name:'文稿页面'}).locator('article')).toHaveCount(2);expect((await(await request.get('/api/datasets?view=chart')).json()).items.length).toBe(before);
 await page.getByRole('textbox',{name:'文稿标题'}).fill(`R14文稿-${randomUUID().slice(0,5)}`);await page.getByRole('button',{name:'保存文稿',exact:true}).click();await page.getByRole('button',{name:'文稿列表',exact:true}).click();await expect(page.locator('.content-card-count').filter({hasText:'2 页'}).first()).toBeVisible();await page.screenshot({path:'backend/var/verification/review14-contents.png'});
 }finally{if(id)await request.post(`/api/contents/${id}/archive`,{data:{}})}
});
