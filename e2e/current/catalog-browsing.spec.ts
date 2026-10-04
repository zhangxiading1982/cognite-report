import {expect,test} from '@playwright/test';

test('catalog directories organize templates, resources and the add-page picker',async({page,request})=>{
 let contentId='';
 try{
  await page.goto('/library');
  await expect(page.getByRole('button',{name:'预览 预算对比',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'目录 图表分析',exact:true}).click();
  await expect(page.getByRole('button',{name:'预览 预算对比',exact:true})).toBeVisible();
  await page.getByPlaceholder('搜索模板名称').fill('预算对比');
  await expect(page.getByRole('button',{name:'预览 预算对比',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'预览 月度趋势',exact:true})).toHaveCount(0);

  await page.goto('/assets');
  await expect(page.getByRole('button',{name:'目录 图标',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'目录 矢量图',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'目录 图片',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'目录 商业表达',exact:true}).click();
  await expect(page.getByRole('button',{name:'预览 增长图表',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'预览 彩色握手',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'预览 彩色柱图',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'目录 办公商务',exact:true}).click();
  await expect(page.getByRole('button',{name:'预览 协作会议',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'预览 方案演示',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'目录 物流供应链',exact:true}).click();
  await expect(page.getByRole('button',{name:'预览 仓储货架',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'预览 港口物流',exact:true})).toBeVisible();
  await page.waitForFunction(()=>[...document.images].filter(image=>image.offsetParent!==null).every(image=>image.complete&&image.naturalWidth>0));
  await page.screenshot({path:'/tmp/review26-expanded-assets.png'});
  await page.getByRole('button',{name:'目录 人物角色',exact:true}).first().click();
  await expect(page.getByRole('button',{name:'预览 系统管理员',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'目录 人物角色',exact:true}).last().click();
  await expect(page.getByRole('button',{name:'预览 开发工程师头像',exact:true})).toBeVisible();
  await page.waitForFunction(()=>[...document.images].filter(image=>image.offsetParent!==null).every(image=>image.complete&&image.naturalWidth>0));
  await page.screenshot({path:'/tmp/review27-role-assets.png'});
  await page.getByRole('button',{name:'目录 数据技术',exact:true}).first().click();
  await expect(page.getByRole('button',{name:'预览 Apache Spark（单色）',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'目录 数据技术',exact:true}).last().click();
  await expect(page.getByRole('button',{name:'预览 PostgreSQL（彩色）',exact:true})).toBeVisible();
  await page.waitForFunction(()=>[...document.images].filter(image=>image.offsetParent!==null).every(image=>image.complete&&image.naturalWidth>0));
  await page.screenshot({path:'/tmp/review27-data-tech-assets.png'});

  await page.goto('/contents');
  const created=page.waitForResponse(response=>response.url().endsWith('/api/contents')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'新建文稿',exact:true}).click();
  contentId=(await(await created).json()).id;
  const dialog=page.getByRole('dialog',{name:'新增页面',exact:true});
  await expect(dialog.getByRole('navigation',{name:'模板目录'})).toBeVisible();
  await dialog.getByRole('button',{name:'目录 图表分析',exact:true}).click();
  await dialog.getByLabel('搜索模板名称').fill('预算对比');
  await expect(dialog.getByRole('button',{name:'选择模板 预算对比',exact:true})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'选择模板 月度趋势',exact:true})).toHaveCount(0);
  await dialog.screenshot({path:'/tmp/review25-template-picker.png'});
 }finally{
  if(contentId)await request.post(`/api/contents/${contentId}/archive`,{data:{}});
 }
});
