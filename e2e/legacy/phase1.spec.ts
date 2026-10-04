import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {createdContent} from "./content-helpers";

for (const [template, title] of [
  ["预算对比", "预算验收"],
  ["月度趋势", "趋势验收"],
  ["收入桥", "归因验收"],
]) {
  test(`${template}：导入→调整→保存恢复→复核→下载`, async ({
    page,
    request,
  }) => {
    const name = `${title}-${randomUUID().slice(0, 6)}`;
    let slideId = "", contentId = "";
    try {
      await page.goto("/slides/new");
      await page
        .getByRole("button", { name: "使用示例数据", exact: true })
        .click();
      await page.getByRole("button", { name: "下一步：选择模板 →" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: new RegExp(`^${template}`) })
        .click();
      await page.getByRole("button", { name: "下一步：确认绑定 →" }).click();
      await page.getByLabel("页面名称").fill(name);
      await page.getByRole("button", { name: "创建页面并进入编辑器" }).click();
      ({slideId,contentId}=await createdContent(page,request));
      await page.goto(`/slides/${slideId}`);
      await expect(page.locator(".svg-content svg")).toBeVisible();
      await expect(page.locator(".svg-content")).toContainText(
        template === "预算对比"
          ? "100万元"
          : template === "月度趋势"
            ? "10.7%"
            : "3100万元",
      );
      await page.getByRole("button", { name: "文本", exact: true }).click();
      await page.getByLabel("文字内容").fill("业务结论：已核对收入数据。");
      await page.getByLabel("X", { exact: true }).fill("700");
      await page.getByLabel("Y", { exact: true }).fill("300");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(page.locator(".save-status")).toContainText("已保存");
      await page.reload();
      await expect(page.locator(".svg-content")).toContainText(
        "业务结论：已核对收入数据。",
      );
      await page
        .getByRole("button", { name: "数据与口径", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText("图表结果字段 Schema");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "关闭", exact: true })
        .click();
      await page
        .getByRole("button", { name: "确认结论已复核", exact: true })
        .click();
      await expect(
        page.getByText("已在当前数据上复核", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "导出 PPT", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "生成 PPT", exact: true }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "生成 PPT", exact: true }).click();
      const link = page
        .getByRole("link", { name: "下载 PPTX", exact: true })
        .first();
      await expect(link).toBeVisible({ timeout: 20000 });
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        link.click(),
      ]);
      expect(await download.failure()).toBeNull();
      const manifest = await request.get(
        (await page
          .getByRole("link", { name: "清单", exact: true })
          .first()
          .getAttribute("href")) ?? "",
      );
      expect(manifest.ok()).toBe(true);
      expect((await manifest.json()).deliveryMode).toBe("final");
    } finally {
      if (contentId) await request.post(`/api/contents/${contentId}/archive`, {data:{}}).catch(()=>{});
      else if (slideId) await request.post(`/api/slides/${slideId}/archive`, { data: {} });
    }
  });
}

test("拒绝错误 JSON 并保留输入让用户修正", async ({ page }) => {
  await page.goto("/slides/new");
  await page.getByLabel("JSON 数据").fill('{"specVersion":"9.0"}');
  await page.getByRole("button", { name: "校验数据", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "下一步：选择模板 →" }),
  ).toBeDisabled();
  await expect(page.getByLabel("JSON 数据")).toHaveValue(
    '{"specVersion":"9.0"}',
  );
});

test("拖拽、图片上传与双窗口冲突保留本地草稿", async ({
  page,
  context,
  request,
}) => {
  const data = await (
    await request.get("/api/fixtures/monthly-operations")
  ).json();
  const response = await request.post("/api/slides/from-import", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      dataSpec: data,
      templateId: "budget-comparison",
      title: "交互与冲突验收",
    },
  });
  expect(response.ok()).toBe(true);
  const slide = await response.json();
  const second = await context.newPage();
  try {
    await page.goto(`/slides/${slide.id}`);
    await second.goto(`/slides/${slide.id}`);
    await expect(page.locator(".svg-content svg")).toBeVisible();
    await expect(second.locator(".svg-content svg")).toBeVisible();
    await page.getByRole("button", { name: "文本", exact: true }).click();
    await page.getByLabel("文字内容").fill("拖拽验收");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    const hit = page.locator(".element-hit.selected");
    const box = (await hit.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 40, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByLabel("X", { exact: true })).not.toHaveValue("48");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.locator(".save-status")).toContainText("已保存");
    const png = await sharp({
      create: { width: 160, height: 80, channels: 3, background: "#17694f" },
    })
      .png()
      .toBuffer();
    await page.getByRole('button', { name: '图片', exact: true }).click();
    await page
      .getByLabel('上传素材文件')
      .setInputFiles({
        name: "sample.png",
        mimeType: "image/png",
        buffer: png,
      });
    await page.getByRole("button", { name: "插入此素材", exact: true }).click();
    await expect(page.locator(".svg-content image")).toHaveCount(1);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.locator(".save-status")).toContainText("已保存");
    await second.getByLabel("页面名称").fill("冲突窗口的本地文字");
    await second.getByRole("button", { name: "保存", exact: true }).click();
    await expect(second.locator("div.conflict")).toBeVisible();
    await expect(second.getByLabel("页面名称")).toHaveValue(
      "冲突窗口的本地文字",
    );
    const stored = await (await request.get(`/api/slides/${slide.id}`)).json();
    expect(stored.title).toBe("交互与冲突验收");
    expect(stored.elements.some((e: any) => e.type === "image")).toBe(true);
  } finally {
    await second.close();
    await request.post(`/api/slides/${slide.id}/archive`, { data: {} });
  }
});
