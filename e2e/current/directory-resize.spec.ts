import {test,expect} from '@playwright/test';
test('sidebar edge toggle and adjustable directory widths persist separately',async({page})=>{
 await page.goto('/contents');
 const sidebar=page.locator('.sidebar'),toggle=sidebar.getByRole('button',{name:'收起功能导航'});
 await expect(toggle).toBeVisible();const side=await sidebar.boundingBox(),button=await toggle.boundingBox();expect(Math.abs(button!.y+button!.height/2-(side!.y+side!.height/2))).toBeLessThan(2);
 await toggle.click();await expect(sidebar.getByRole('button',{name:'展开功能导航'})).toBeVisible();
 for(const label of ['模板库','资源库','数据管理']){
  await sidebar.getByRole('button',{name:label,exact:true}).click();const separator=page.getByRole('separator',{name:'调整目录宽度'});await expect(separator).toBeVisible();const before=Number(await separator.getAttribute('aria-valuenow'));const box=(await separator.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+70);await page.mouse.down();await page.mouse.move(box.x+box.width/2+60,box.y+70);await page.mouse.up();await expect(separator).toHaveAttribute('aria-valuenow',String(before+60));
  await separator.focus();await page.keyboard.press('ArrowLeft');await expect(separator).toHaveAttribute('aria-valuenow',String(before+44));
  const pane=await page.locator('.directory-split-tree').boundingBox(),rail=await sidebar.boundingBox();expect(pane!.x-(rail!.x+rail!.width)).toBeLessThan(20);
 }
 await page.screenshot({path:'backend/var/verification/review14-directory.png'});
 await page.reload();await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow','304');
});
