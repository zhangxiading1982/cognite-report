import {expect,type Page,type APIRequestContext} from '@playwright/test';
export async function createdContent(page:Page,request:APIRequestContext){
 await expect(page).toHaveURL(/\/contents\/deck-/);
 await expect(page.locator('.svg-content svg')).toBeVisible();
 const contentId=page.url().split('/').at(-1)!;
 const response=await request.get(`/api/contents/${contentId}`);expect(response.ok()).toBe(true);
 const content=await response.json();return {contentId,slideId:content.pages[0].slideId};
}
