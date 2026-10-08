import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
const baseURL=process.env.SLIDEBI_E2E_BASE_URL??'http://127.0.0.1:5173';

test('资源库：SVG上传、自动微调、下载与另存保留原件', async ({page,request}) => {
 const name=`资源加工验收-${randomUUID().slice(0,6)}`;const ids:string[]=[];
 try {
  await page.goto('/assets');
  await page.getByRole('button',{name:'上传资源',exact:true}).click();
  const upload=page.getByRole('dialog',{name:'上传资源'});
  await upload.getByLabel('上传素材种类').selectOption('vector');
  await upload.getByLabel('SVG 名称',{exact:true}).fill(name);
  await upload.getByLabel('SVG 代码',{exact:true}).fill('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ffffff"/><rect x="10" y="10" width="20" height="20" fill="#146b52"/></svg>');
  await upload.getByRole('button',{name:'校验并上传 SVG'}).click();
  let detail=page.getByRole('dialog',{name,exact:true});
  await expect(detail).toBeVisible();
  await expect(detail.getByText('来源与授权')).toHaveCount(0);
  const original=(await(await request.get('/api/assets')).json()).items.find((a:any)=>a.name===name);ids.push(original.id);expect(original.kind).toBe('vector');
  const originalBytes=await(await request.get(original.url)).body();
  await detail.getByLabel('底色容差').fill('31');
  await expect(detail.getByAltText('底色处理预览')).toBeVisible();
  await detail.getByLabel('处理方式').selectOption('recolor');
  await detail.getByLabel('图形颜色',{exact:true}).fill('#112233');
  await expect(detail.getByRole('link',{name:'下载 PNG'})).toBeVisible();
  const downloaded=page.waitForEvent('download');await detail.getByRole('link',{name:'下载 PNG'}).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.png$/);
  await detail.getByLabel('处理方式').selectOption('replaceBackground');
  await detail.getByLabel('新背景色').fill('#112233');
  await detail.getByLabel('副本名称').fill(name+'换底');
  await expect(detail.getByRole('button',{name:'保存新副本'})).toBeEnabled();
  await detail.getByRole('button',{name:'保存新副本'}).click();
  detail=page.getByRole('dialog',{name:name+'换底',exact:true});await expect(detail).toBeVisible();
  const copy=(await(await request.get('/api/assets')).json()).items.find((a:any)=>a.name===name+'换底');ids.push(copy.id);
  const pixels=await sharp(await(await request.get(copy.url)).body()).ensureAlpha().raw().toBuffer();expect([...pixels.subarray(0,4)]).toEqual([17,34,51,255]);
  expect((await(await request.get(original.url)).body()).equals(originalBytes)).toBe(true);
  await detail.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:`预览 ${name}`,exact:true}).click();
  await expect(page.getByRole('dialog',{name,exact:true})).toBeVisible();
 }finally{for(const id of ids){const r=await request.post(`/api/assets/${id}/archive`,{data:{}});expect(r.ok(),await r.text()).toBe(true)}}
});

test('资源目录保持展开、路径导航与非owner只读预览',async({page,request,browser})=>{
 const name=`目录验收-${randomUUID().slice(0,6)}`;let folderId='',assetId='';
 try{
  const f=await request.post('/api/folders',{data:{kind:'assets',name,parentId:null}});expect(f.ok()).toBe(true);folderId=(await f.json()).id;
  const upload=await request.post('/api/assets',{multipart:{name,kind:'icon',file:{name:'test.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="8" fill="#2563eb"/></svg>')}}});expect(upload.ok()).toBe(true);assetId=(await upload.json()).id;
  await request.patch(`/api/management/assets/${assetId}`,{data:{visibility:'public',folderId}});
  await page.goto('/assets');await page.getByRole('button',{name:`目录 ${name}`,exact:true}).click();
  await expect(page.getByRole('navigation',{name:'当前位置'})).toContainText(name);
  await expect(page.getByRole('button',{name:`预览 ${name}`,exact:true})).toBeVisible();
  await page.getByRole('button',{name:`预览 ${name}`,exact:true}).click();const detail=page.getByRole('dialog',{name,exact:true});
  await detail.getByRole('button',{name:'修改资源目录'}).click();await detail.getByLabel('所属目录',{exact:true}).selectOption('');
  await detail.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'返回资源库根目录'}).click();
  await expect(page.getByRole('button',{name:`预览 ${name}`,exact:true})).toBeVisible();
  const context=await browser.newContext({storageState:{cookies:[],origins:[]}});try{await context.request.post(`${baseURL}/api/auth/login`,{data:{username:'summer',password:'summer'}});const viewer=await context.newPage();await viewer.goto(`${baseURL}/assets`);await viewer.getByRole('button',{name:`预览 ${name}`,exact:true}).click();const preview=viewer.getByRole('dialog',{name,exact:true});await expect(preview.getByRole('button',{name:'可见性：公开'})).toBeDisabled();await expect(preview.getByRole('button',{name:'修改资源目录'})).toBeDisabled();await expect(preview.getByText('素材微调')).toHaveCount(0);await expect(viewer.getByRole('button',{name:`删除 ${name}`,exact:true})).toHaveCount(0);}finally{await context.close()}
 }finally{if(assetId){const r=await request.post(`/api/assets/${assetId}/archive`,{data:{}});expect(r.ok(),await r.text()).toBe(true)}if(folderId){const r=await request.delete(`/api/folders/${folderId}`);expect(r.ok(),await r.text()).toBe(true)}}
});
