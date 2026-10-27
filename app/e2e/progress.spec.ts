import { expect, test } from "@playwright/test";
import { openHome, openYear, tab } from "./helpers";

// 継続とレベル（T029）

test("上の帯に「🔥0 Lv.1」、押すと律のページ（T065）。マイページで今日 0 / 20。目標はマイページで変えられる", async ({ page }) => {
  await openHome(page);
  await expect(page.locator(".streak-chip")).toHaveText("🔥0 Lv.1");
  await page.locator(".streak-chip").click();
  await expect(page).toHaveURL(/\/ritsu$/);
  await tab(page, "マイページ").click();
  await expect(page.locator(".today-goal")).toContainText("今日 0 / 20 肢");
  await page.getByRole("group", { name: "1日の目標" }).getByRole("button", { name: "10肢" }).click();
  await expect(page.locator(".today-goal")).toContainText("今日 0 / 10 肢");
});

test("答えてレベルが上がり、今日の目標に届くと、答え合わせにお祝いが出る", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2026-shoho.json")).json();
  const ids = data.statements.filter((s: any) => s.truth_at_exam && !s.review_flag).slice(0, 9).map((s: any) => s.id);
  // 今日すでに9肢正解（経験値18）・目標10肢。あと1肢正解すると経験値20で Lv.2、今日10肢で目標達成
  await page.addInitScript((ids) => {
    if (localStorage.getItem("tanto.log.v1")) return;
    const now = new Date().toISOString();
    localStorage.setItem("tanto.log.v1", JSON.stringify(ids.map((s: string, i: number) => ({ id: `t${i}`, s, ok: true, at: now }))));
    localStorage.setItem("tanto.goal.v1", JSON.stringify({ daily: 10 }));
  }, ids);
  const minpo = await (await request.get("/data/yobi-2026-minpo.json")).json();
  const first = minpo.statements.find((s: any) => s.truth_at_exam && !s.review_flag);
  await openHome(page);
  await expect(page.locator(".streak-chip")).toHaveText("🔥1 Lv.1");
  await openYear(page, "民法", "R08", "肢で解く");
  await page.getByRole("button", { name: first.truth_at_exam.value ? "○" : "×", exact: true }).click();
  await expect(page.locator(".page .celebrate")).toContainText("レベルアップ！ Lv.2");
  await expect(page.locator(".page .celebrate")).toContainText("今日の目標達成！");
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator(".page .celebrate")).toHaveCount(0);
});
