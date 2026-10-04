import {test,expect} from '@playwright/test';
test('global navigation auto collapses and library trees start at slash',async({page})=>{
 await page.goto('/contents');const rail=page.locator('.sidebar');const before=(await rail.boundingBox())!.width;
 await rail.getByRole('button',{name:'模板库',exact:true}).click();await expect(page.getByRole('button',{name:'展开功能导航'})).toBeVisible();expect((await rail.boundingBox())!.width).toBeLessThan(before);
 await expect(page.getByRole('button',{name:'目录根路径 /',exact:true})).toBeVisible();await expect(page.getByText('分组目录',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'展开功能导航'}).click();expect((await rail.boundingBox())!.width).toBe(before);
 await rail.getByRole('button',{name:'资源库',exact:true}).click();await expect(page.getByRole('button',{name:'展开功能导航'})).toBeVisible();await expect(page.getByRole('button',{name:'目录根路径 /',exact:true})).toBeVisible();await expect(rail.getByRole('button',{name:'我的文档',exact:true})).toHaveAttribute('title','我的文档');
 await page.screenshot({path:'backend/var/verification/review13-navigation.png'});
});
