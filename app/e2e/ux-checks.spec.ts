import { expect, test } from "@playwright/test";
import { openHome, openYear, tab } from "./helpers";

// 使い心地の総点検（T049）で見つけて直したもの

test.use({ viewport: { width: 390, height: 844 } });

test("肢カード：○×の聞き方をはっきり書き、問の文は2行に畳む（押すと全文）", async ({ page }) => {
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  await expect(page.locator(".page .ask")).toHaveText("この記述は正しい（○）か、誤り（×）か");
  const stem = page.locator(".page .card-stem .stem");
  await expect(stem).toHaveClass(/clamped/);
  await page.getByRole("button", { name: "問の文の全文" }).click();
  await expect(stem).not.toHaveClass(/clamped/);
  await page.getByRole("button", { name: "○", exact: true }).click();
  await expect(page.locator(".page .ask")).toHaveCount(0); // 答えの後は出さない
});

test("マイページ：記録を消すボタンの文字が見える。記録が1日だけでも累計のグラフは横に引く", async ({ page }) => {
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  await page.getByRole("button", { name: "○", exact: true }).click();
  await page.getByRole("button", { name: "← 戻る" }).click();
  await tab(page, "マイページ").click();
  await page.getByRole("tab", { name: "設定" }).click(); // マイページは「記録」「設定」に分けた（T065）
  const del = page.getByRole("button", { name: "この端末の記録を消す" });
  const [color, bg] = await del.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  expect(color).not.toBe(bg);
  expect(bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  // 線（climb-line）の始めと終わりが同じ高さ（グラフは「記録」）
  await page.getByRole("tab", { name: "記録" }).click();
  const d = await page.locator(".climb-line").getAttribute("d");
  const ys = [...d!.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => m[1]);
  expect(ys.length).toBe(2);
  expect(ys[0]).toBe(ys[1]);
});

test("フッターのリンクは語の途中で折り返さない", async ({ page }) => {
  await openHome(page);
  for (const name of ["利用規約", "プライバシーポリシー"]) {
    const link = page.locator(".footer-links").getByRole("button", { name });
    const box = (await link.boundingBox())!;
    const lineHeight = await link.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || 20);
    expect(box.height).toBeLessThan(lineHeight * 1.8);
  }
});
