import { expect, test } from "@playwright/test";
import { openHome, openYear, tab, totalCards } from "./helpers";

test("★：肢カードで付け、ホームから★の肢だけを解く。元の問題でも付け外しでき、再読み込み後も残る（T026）", async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole("button", { name: /★を付けた肢を解く/ })).toHaveCount(0); // ★がなければ出さない

  // 1枚目に★を付ける（答え合わせのあと）
  await openYear(page, "民法", "R08", "肢で解く");
  await page.getByRole("button", { name: "○", exact: true }).click();
  await page.getByRole("button", { name: "あとで見直す（★を付ける）" }).click();
  await expect(page.getByRole("button", { name: "★を外す" })).toHaveAttribute("aria-pressed", "true");

  // 元の問題の各肢の★：1枚目は付いている。もう1つの肢に付ける
  await page.getByRole("button", { name: "元の問題を見る" }).click();
  const stars = page.locator(".question button.star.compact");
  await expect(page.locator(".question li.highlight button.star")).toHaveText("★");
  await page.locator(".question li:not(.highlight) button.star").first().click();
  await expect(stars.filter({ hasText: "★" })).toHaveCount(2);

  await page.getByRole("button", { name: "← 戻る" }).click();
  await tab(page, "ホーム").click();
  await expect(page.getByRole("button", { name: "★を付けた肢を解く（2枚）" })).toBeVisible();

  // 再読み込みしても残る
  await page.reload();
  await expect(page.getByRole("button", { name: "★を付けた肢を解く（2枚）" })).toBeVisible();
  await page.getByRole("button", { name: "★を付けた肢を解く（2枚）" }).click();
  expect(await totalCards(page)).toBe(2);
  await expect(page.locator(".toolbar")).toContainText("★を付けた肢");

  // 解きながら外す → ホームの枚数が減る
  await page.getByRole("button", { name: "×", exact: true }).click();
  await page.getByRole("button", { name: "★を外す" }).click();
  await page.getByRole("button", { name: "← 戻る" }).click();
  await expect(page.getByRole("button", { name: "★を付けた肢を解く（1枚）" })).toBeVisible();
});
