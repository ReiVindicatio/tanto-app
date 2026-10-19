import { expect, test } from "@playwright/test";
import { gotoSubject, openHome, openYear, tab } from "./helpers";

test("下のタブで3つの画面を行き来でき、戻る操作で前の画面に戻る（T025）", async ({ page }) => {
  await openHome(page);
  await expect(tab(page, "ホーム")).toHaveAttribute("aria-current", "page");
  await tab(page, "科目").click();
  await expect(page).toHaveURL(/\/subjects$/);
  await expect(page.getByRole("heading", { name: "科目" })).toBeVisible();
  await tab(page, "マイページ").click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole("button", { name: "Google でログイン" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/subjects$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test("解いている画面ではタブを隠し、戻ると科目の画面に戻る。再読み込みで中身がなければホームへ", async ({ page }) => {
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.locator("nav.tabbar")).toHaveCount(0);
  await expect(page.locator(".actionbar").getByRole("button", { name: "○", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/subjects\/minpo$/);
  await expect(page.locator("nav.tabbar")).toBeVisible();
  await page.goForward();
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".card.hero")).toBeVisible();
});

test("科目の画面の URL を直接開ける。存在しない科目は科目の一覧へ", async ({ page }) => {
  await page.goto("/subjects/keiso");
  await expect(page.locator("h1.subject-title")).toContainText("刑事訴訟法");
  await expect(page.locator(".set.year")).toHaveCount(15);
  await page.goto("/subjects/nosuch");
  await expect(page).toHaveURL(/\/subjects$/);
});

test("テーマ：ダークに切り替えると保存され、再読み込みしても続く。端末に合わせるに戻すと保存を消す", async ({ page }) => {
  await openHome(page);
  await tab(page, "マイページ").click();
  await page.getByRole("button", { name: "ダーク" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "端末に合わせる" }).click();
  expect(await page.evaluate(() => localStorage.getItem("tanto.theme.v1"))).toBeNull();
});

test("解いている間はタブがなく、答えた肢はマイページの累計に入る", async ({ page }) => {
  await openHome(page);
  await expect(page.locator(".card.today")).toHaveCount(0); // T034：ホームの今日の成績はやめた
  await gotoSubject(page, "民法");
  await page.locator(".set.year").first().getByRole("button", { name: /肢で解く/ }).click();
  await page.getByRole("button", { name: "○", exact: true }).click();
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByRole("button", { name: "×", exact: true }).click();
  await expect(page.locator("nav.tabbar")).toHaveCount(0); // 解いている間はタブがない
  await page.getByRole("button", { name: "← 戻る" }).click();
  await tab(page, "マイページ").click();
  await expect(page.locator(".card").first()).toContainText("累計 2 肢");
});
