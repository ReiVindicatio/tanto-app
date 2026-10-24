import { expect, test } from "@playwright/test";
import { openHome, openYear } from "./helpers";

// エンドレスと「終わる」

test("エンドレス：20問を超えても次の肢が足されて続き、「終わる」で答えた分の結果を出す", async ({ page }) => {
  await openHome(page);
  await page.locator(".hero").getByRole("button", { name: "エンドレス" }).click();
  await expect(page.locator(".hero-title")).toHaveText("エンドレス");
  await expect(page.locator(".hero-breakdown")).toContainText(/全科目：肢 [\d,]+枚から、終わるまで続けて出します/);
  await page.getByRole("button", { name: "はじめる" }).click();
  await expect(page.locator(".toolbar")).toContainText("エンドレス　1問目");
  await expect(page.locator(".play-progress")).toHaveCount(0);
  const seen = new Set<string>();
  for (let k = 0; k < 25; k++) {
    seen.add(await page.locator(".page .statement").innerText());
    await page.getByRole("button", { name: k % 2 ? "×" : "○", exact: true }).click();
    await page.getByRole("button", { name: "次へ" }).click();
    await expect(page.locator(".toolbar")).toContainText(`${k + 2}問目`);
  }
  expect(seen.size).toBe(25); // 同じ肢を2度出していない
  await page.getByRole("button", { name: "終わる" }).click();
  await expect(page.getByText(/\d+ \/ 25 正解/)).toBeVisible();
  // 選んだ問題数は覚えている
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(page.locator(".hero-title")).toHaveText("エンドレス");
});

test("終わる：年度ごとに解いている途中でも、答えた分だけで結果を出す", async ({ page }) => {
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  await expect(page.getByRole("button", { name: "終わる" })).toHaveCount(0); // 1枚も答えていないうちは出さない
  for (let k = 0; k < 3; k++) {
    await page.getByRole("button", { name: "○", exact: true }).click();
    await page.getByRole("button", { name: "次へ" }).click();
  }
  await page.getByRole("button", { name: "終わる" }).click();
  await expect(page.getByText(/\d \/ 3 正解/)).toBeVisible();
});
