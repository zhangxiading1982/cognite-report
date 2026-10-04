import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('模板库只提供预览收藏，样例说明不显示技术来源', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByRole('button', { name: '预览 预算对比', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '使用模板', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '预览 预算对比', exact: true }).click();
  const info = page.locator('.preview-information');
  await expect(info).toContainText('数据规范与样例');
  await expect(info.locator('table').first()).toBeVisible();
  await expect(info).not.toContainText('operations-demo');
  await expect(info).not.toContainText('fixture');
  await expect(info.locator('.callout')).toHaveCount(0);
  await page.screenshot({ path: 'backend/var/verification/review9-template-preview.png' });
});

test('文稿添加页面时选择模板并保存到当前文稿', async ({ page, request }) => {
  const response = await request.post('/api/contents', {
    headers: { 'Idempotency-Key': randomUUID() }, data: { title: `模板入口验收-${randomUUID()}` },
  });
  expect(response.ok()).toBe(true);
  const content = await response.json();
  try {
    await page.goto(`/contents/${content.id}`);
    await page.getByRole('button', { name: '添加页面', exact: true }).click();
    await page.getByRole('button', { name: '使用示例数据', exact: true }).click();
    await page.getByRole('button', { name: '下一步：选择模板 →' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^预算对比/ }).click();
    await page.getByRole('button', { name: '下一步：确认绑定 →' }).click();
    await page.getByLabel('页面名称').fill('从文稿选择模板');
    await page.getByRole('button', { name: '创建页面并进入编辑器' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('页面名称', { exact: true })).toHaveValue('从文稿选择模板');
    await expect(page).toHaveURL(`/contents/${content.id}`);
    await page.reload();
    await expect(page.getByLabel('页面名称', { exact: true })).toHaveValue('从文稿选择模板');
    const saved = await (await request.get(`/api/contents/${content.id}`)).json();
    expect(saved.pages).toHaveLength(1);
  } finally {
    const saved = await (await request.get(`/api/contents/${content.id}`)).json();
    await request.post(`/api/contents/${content.id}/archive`, { data: {} });
    for (const item of saved.pages || []) await request.post(`/api/slides/${item.slideId}/archive`, { data: {} });
  }
});
