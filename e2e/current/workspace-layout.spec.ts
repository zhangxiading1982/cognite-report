import {expect,test} from '@playwright/test';

test('resource workspaces use a compact path and unified feature toolbar',async({page})=>{
 const errors:string[]=[];
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/library');
 await expect(page).toHaveURL(/\/library$/);
 await expect(page.locator('body')).not.toBeEmpty();
 await expect(page.locator('vite-error-overlay')).toHaveCount(0);
 const topTitle=page.locator('.topbar-current');
 await expect(topTitle).toHaveText('模板库');
 expect(Number.parseFloat(await topTitle.evaluate(node=>getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
 const templateToolbar=page.locator('.library-toolbar');
 await expect(templateToolbar.getByPlaceholder('搜索模板名称')).toBeVisible();
 await expect(templateToolbar.getByRole('button',{name:'导入模板'})).toBeVisible();
 await expect(templateToolbar.getByRole('button',{name:'管理目录'})).toBeVisible();
 await expect(templateToolbar.getByRole('navigation',{name:'当前位置'})).toHaveText('/');
 await expect(page.getByRole('heading',{name:'模板库'})).toHaveCount(0);
 const templateTreeBox=await page.getByRole('region',{name:'模板库目录'}).boundingBox();

 const separator=page.getByRole('separator',{name:'调整目录宽度'});
 const initial=Number(await separator.getAttribute('aria-valuenow'));
 await separator.press('ArrowRight');
 await expect(separator).toHaveAttribute('aria-valuenow',String(initial+16));

 await page.getByRole('button',{name:'资源库',exact:true}).click();
 const assetToolbar=page.locator('.library-toolbar');
 await expect(assetToolbar.getByRole('button',{name:'全部',exact:true})).toBeVisible();
 await expect(assetToolbar.getByLabel('搜索图片')).toBeVisible();
 await expect(assetToolbar.getByRole('button',{name:'上传资源'})).toBeVisible();
 await expect(assetToolbar.getByRole('button',{name:'管理目录'})).toBeVisible();
 await expect(assetToolbar.getByRole('navigation',{name:'当前位置'})).toHaveText('/');

 await page.getByRole('button',{name:'数据管理',exact:true}).click();
 const dataDirectory=page.getByRole('region',{name:'数据目录'}),dataTree=page.getByRole('tree',{name:'数据文件目录'}),dataToolbar=page.locator('.data-library-toolbar');
 await expect(dataTree).toBeVisible();
 await expect(dataToolbar.getByLabel('当前数据目录路径')).toHaveText('/');
 await expect(dataToolbar.getByLabel('搜索数据集')).toBeVisible();
 await expect(dataToolbar.getByRole('button',{name:'新增数据集'})).toBeVisible();
 await expect(dataToolbar.getByRole('button',{name:'管理数据目录'})).toBeVisible();
 const dataDirectoryBox=await dataDirectory.boundingBox(),dataToolbarBox=await dataToolbar.boundingBox();
 expect(Math.abs(dataDirectoryBox!.y-templateTreeBox!.y)).toBeLessThanOrEqual(2);
 expect(Math.abs(dataToolbarBox!.y-dataDirectoryBox!.y)).toBeLessThanOrEqual(2);
 expect(dataToolbarBox!.x).toBeGreaterThan(dataDirectoryBox!.x+dataDirectoryBox!.width);
 await page.screenshot({path:'/tmp/review15-layout.png'});
 expect(errors).toEqual([]);
});
