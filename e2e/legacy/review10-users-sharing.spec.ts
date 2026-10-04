import {test,expect,request as requests} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import JSZip from 'jszip';
test('登录、管理员入口和账号切换隔离',async({page})=>{
 await page.context().clearCookies();await page.goto('/contents');
 await expect(page.getByRole('heading',{name:'登录工作空间'})).toBeVisible();
 await page.getByLabel('用户名',{exact:true}).fill('marx');await page.getByLabel('密码',{exact:true}).fill('admin');await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'用户管理',exact:true}).click();
 await expect(page.locator('.user-table')).toContainText('summer');await expect(page.locator('.user-table')).toContainText('mary');
 await page.screenshot({path:'backend/var/verification/review10-users.png'});
 await page.getByRole('button',{name:'退出登录'}).click();
 await page.getByLabel('用户名',{exact:true}).fill('summer');await page.getByLabel('密码',{exact:true}).fill('summer');await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page.getByRole('button',{name:'用户管理',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'退出登录'})).toBeVisible();
 const denied=await page.request.get('/api/users');expect(denied.status()).toBe(403);
});

test('公开文稿跨用户预览导出，私有内容隐藏与写入拒绝',async({page,request})=>{
 const suffix=randomUUID().slice(0,8);let docId='',slideId='';const name=`公开文稿验收-${suffix}`;
 const user=await requests.newContext({baseURL:'http://127.0.0.1:5173',storageState:{cookies:[],origins:[]}});
 const post=async(path:string,data:any)=>{const r=await request.post('/api'+path,{headers:{'Idempotency-Key':randomUUID()},data});expect(r.ok(),await r.text()).toBe(true);return r.json()};
 try{
 const sample=await(await request.get('/api/fixtures/monthly-operations')).json();const s=await post('/slides/from-import',{templateId:'budget-comparison',dataSpec:sample,title:name});slideId=s.id;
 const doc=await post('/contents',{title:name});docId=doc.id;await post(`/contents/${docId}/pages`,{revision:doc.revision,slideId});
 await user.post('/api/auth/login',{data:{username:'mary',password:'mary'}});
 expect((await user.get(`/api/contents/${docId}`)).status()).toBe(404);
 const published=await request.patch(`/api/management/contents/${docId}`,{data:{visibility:'public'}});expect(published.ok(),await published.text()).toBe(true);
 await page.context().clearCookies();await page.context().addCookies((await user.storageState()).cookies);
 await page.goto(`/contents/${docId}`);await expect(page.getByRole('button',{name:'添加页面',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'保存文稿'})).toHaveCount(0);
 await page.getByRole('button',{name:'预览文稿',exact:true}).click();await expect(page.getByRole('heading',{name:'文稿预览 · 1 页'})).toBeVisible();
 await page.screenshot({path:'backend/var/verification/review10-public-document.png'});
 await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
 const exported=page.waitForResponse(r=>r.url().endsWith(`/decks/${docId}/export`)&&r.request().method()==='POST');await page.getByRole('button',{name:'导出 PPT',exact:true}).click();const job=await(await exported).json();
 const link=page.locator(`a[href="/api/export-jobs/${job.id}/file.pptx"]`);await expect(link).toBeVisible({timeout:20000});
 const file=await user.get(`/api/export-jobs/${job.id}/file.pptx`);expect(file.ok()).toBe(true);const zip=await JSZip.loadAsync(await file.body());expect(zip.file(/ppt\/slides\/slide\d+\.xml$/)).toHaveLength(1);
 expect((await user.patch(`/api/management/contents/${docId}`,{data:{name:'越权'}})).status()).toBe(403);
 await request.patch(`/api/management/contents/${docId}`,{data:{visibility:'private'}});expect((await user.get(`/api/contents/${docId}`)).status()).toBe(404);
 }finally{if(docId)await request.post(`/api/contents/${docId}/archive`,{data:{}});if(slideId)await request.post(`/api/slides/${slideId}/archive`,{data:{}});await user.dispose();}
});

test('数据目录新建、浏览、名称搜索与双击修改',async({page,request})=>{
 const name=`目录验收-${randomUUID().slice(0,8)}`;let folderId='',dataId='';
 try{
 await page.goto('/data');await page.getByRole('button',{name:'新建目录',exact:true}).click();await page.getByLabel('目录名称',{exact:true}).fill(name);await page.getByRole('button',{name:'创建目录',exact:true}).click();await page.getByRole('button',{name:`打开目录 ${name}`,exact:true}).click();
 folderId=(await(await request.get('/api/folders?kind=data')).json()).items.find((f:any)=>f.name===name).id;
 const preview=await(await request.post('/api/templates/budget-comparison/preview',{data:{}})).json();const r=await request.post('/api/datasets',{data:{name:`数据-${name}`,dataSpec:preview.dataSpec}});expect(r.ok()).toBe(true);dataId=(await r.json()).id;await request.patch(`/api/management/data/${dataId}`,{data:{folderId}});
 await page.reload();await page.getByRole('button',{name:`打开目录 ${name}`,exact:true}).click();await expect(page.getByText(`数据-${name}`,{exact:true})).toBeVisible();
 await page.getByText(`数据-${name}`,{exact:true}).dblclick();await page.getByLabel('修改名称',{exact:true}).fill(`已改名-${name}`);await page.getByLabel('修改名称',{exact:true}).press('Enter');await expect(page.getByText(`已改名-${name}`,{exact:true})).toBeVisible();
 await page.screenshot({path:'backend/var/verification/review10-data-folders.png'});
 }finally{if(dataId){const d=await(await request.get(`/api/datasets/${dataId}`)).json();await request.delete(`/api/datasets/${dataId}`,{headers:{'If-Match':String(d.version)}});}if(folderId)await request.delete(`/api/folders/${folderId}`);}
});
