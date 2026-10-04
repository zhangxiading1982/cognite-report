import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('account toolbar and page directories separate navigation from maintenance',async({page,request})=>{
 const name=`R12导航-${randomUUID().slice(0,8)}`;
 const result=await request.post('/api/folders',{data:{kind:'assets',name}});expect(result.ok()).toBe(true);const folder=await result.json();
 try{
  await page.goto('/assets');
  const top=page.locator('.topbar'),global=page.locator('.sidebar');
  await expect(top).toContainText('marx');await expect(top.getByRole('button',{name:'用户管理'})).toBeVisible();await expect(top.getByRole('button',{name:'退出登录'})).toBeVisible();
  await expect(global.getByRole('button',{name:'用户管理'})).toHaveCount(0);await expect(global.getByRole('button',{name:`目录 ${name}`,exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:`目录 ${name}`,exact:true}).click();
  await expect(page.getByRole('navigation',{name:'当前位置'})).toContainText(name);
  await page.getByRole('button',{name:'管理目录',exact:true}).click();
  const manager=page.getByRole('dialog',{name:'资源库目录管理'});
  await manager.getByRole('button',{name:`打开目录 ${name}`,exact:true}).click();
  await manager.getByRole('button',{name:'全部目录 / 根目录',exact:true}).click();
  await manager.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'当前位置'})).toContainText(name);
  await page.screenshot({path:'backend/var/verification/review12-workspace.png'});
  await top.getByRole('button',{name:'用户管理'}).click();await expect(page.getByRole('heading',{name:'用户管理',exact:true})).toBeVisible();
 }finally{const removed=await request.delete(`/api/folders/${folder.id}`);expect(removed.ok(),await removed.text()).toBe(true)}
});
