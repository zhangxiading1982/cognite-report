import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import JSZip from 'jszip';
test('多页文稿：编辑顺序持久化、可选导航与冻结 PPTX 下载',async({page,request})=>{
 const title=`文稿导航验收-${randomUUID().slice(0,6)}`;let contentId='';
 try{
  let d=await(await request.post('/api/contents',{data:{title}})).json();contentId=d.id;
  const dataSpec=await(await request.get('/api/fixtures/monthly-operations')).json();
  for(let i=1;i<=2;i++){
   const response=await request.post('/api/slides/from-import',{headers:{'Idempotency-Key':randomUUID()},data:{dataSpec,templateId:'budget-comparison',title:`${title}-页面${i}`}});expect(response.ok()).toBe(true);
   const s=await response.json();const added=await request.post(`/api/contents/${contentId}/pages`,{data:{revision:d.revision,slideId:s.id}});expect(added.ok()).toBe(true);d=await added.json();
  }
  await page.goto(`/contents/${contentId}`);await expect(page.locator('.svg-content svg')).toBeVisible();
  await page.getByRole('button',{name:'下移第 1 页',exact:true}).click();await expect(page.locator('.content-page-select').first()).toContainText('页面2');
  await page.reload();await expect(page.locator('.content-page-select').first()).toContainText('页面2');
  await page.getByText('导航与交付设置（可选）',{exact:true}).click();
  for(const name of ['封面','导航页','章节页']){await page.getByRole('checkbox',{name,exact:true}).check();await expect(page.getByRole('checkbox',{name,exact:true})).toBeEnabled();}
  await page.getByRole('combobox',{name:'交付方式',exact:true}).selectOption('draft');
  await page.getByRole('button',{name:'预览文稿',exact:true}).click();const dialog=page.getByRole('dialog',{name:'文稿预览 · 5 页'});await expect(dialog.locator('.actual-preview svg')).toBeVisible();
  await page.screenshot({path:'backend/var/verification/review6-native-navigation.png'});
  const result=page.waitForResponse(r=>r.url().includes(`/decks/${contentId}/export`)&&r.request().method()==='POST');
  await expect(dialog.getByRole('button',{name:'导出 PPT',exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'导出 PPT',exact:true}).click();const job=await(await result).json();
  const link=page.locator(`a[href="/api/export-jobs/${job.id}/file.pptx"]`);await expect(link).toBeVisible({timeout:20000});
  const [download]=await Promise.all([page.waitForEvent('download'),link.click()]);expect(download.suggestedFilename()).toMatch(/\.pptx$/);await download.saveAs('backend/var/verification/review6-native-navigation.pptx');
  const zip=await JSZip.loadAsync(await(await request.get((await link.getAttribute('href'))!)).body());expect(zip.file(/^ppt\/slides\/slide\d+\.xml$/)).toHaveLength(5);
 }finally{if(contentId)await request.post(`/api/contents/${contentId}/archive`,{data:{}}).catch(()=>{});}
});
