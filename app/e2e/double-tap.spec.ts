import { expect, test, type Page } from "@playwright/test";
import { openHome, openYear } from "./helpers";

// 下の欄のボタンは同じ場所で入れ替わる（○×⇄次へ、採点する⇄次へ）。スマホの二度押しで、入れ替わった先のボタンまで押さない（swapGuard.ts）

const logLength = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("tanto.log.v1") ?? "[]").length);

/** 同じ位置を 80 ミリ秒あけて2回押す（ボタンの中心から少しずらす：○と×の間のすき間に当たらないように） */
async function doubleTap(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const x = box.x + box.width * 0.3;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await page.waitForTimeout(80);
  await page.mouse.click(x, y);
  await page.waitForTimeout(400);
}

test("肢で解く：○の二度押しで、答え合わせを飛ばして次の肢へ進まない", async ({ page }) => {
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  await expect(page.locator(".toolbar")).toContainText("1 / ");
  await doubleTap(page, (await page.locator(".actionbar").getByRole("button", { name: "×", exact: true }).boundingBox())!);
  await expect(page.locator(".toolbar")).toContainText("1 / ");
  await expect(page.locator(".actionbar").getByRole("button", { name: "次へ" })).toBeVisible();
  expect(await logLength(page)).toBe(1);
});

test("肢で解く：次へ の二度押しで、次の肢に答えてしまわない", async ({ page }) => {
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  await page.locator(".actionbar").getByRole("button", { name: "○", exact: true }).click();
  const next = page.locator(".actionbar").getByRole("button", { name: "次へ" });
  await expect(next).toBeVisible();
  await page.waitForTimeout(400);
  await doubleTap(page, (await next.boundingBox())!);
  await expect(page.locator(".toolbar")).toContainText("2 / ");
  await expect(page.locator(".actionbar").getByRole("button", { name: "○", exact: true })).toBeVisible();
  expect(await logLength(page)).toBe(1);
  // 少し待てば、ふつうに答えられる
  await page.locator(".actionbar").getByRole("button", { name: "○", exact: true }).click();
  await expect(next).toBeVisible();
  expect(await logLength(page)).toBe(2);
});

test("問で解く：採点する の二度押しで、結果を見ずに次の問へ進まない", async ({ page }) => {
  await openHome(page);
  await openYear(page, "刑法", "R08", "問で解く");
  await expect(page.locator(".toolbar")).toContainText("1 / ");
  for (const slot of await page.locator(".slot").all()) await slot.locator("button.opt").first().click();
  const submit = page.locator(".actionbar").getByRole("button", { name: "採点する" });
  await expect(submit).toBeEnabled();
  await page.waitForTimeout(400);
  await doubleTap(page, (await submit.boundingBox())!);
  await expect(page.locator(".toolbar")).toContainText("1 / ");
  await expect(page.locator(".result")).toBeVisible();
});
