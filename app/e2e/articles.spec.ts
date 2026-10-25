import { expect, test } from "@playwright/test";
import { gotoSubject, openHome, openYear } from "./helpers";

// 条文から逆引き（T060）

test("解説の条文を押すと条文の画面。戻ると解いていた肢の続きから。この条の肢を解ける", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2026-minpo.json")).json();
  const exp = new Map(data.explanations.map((e: any) => [e.statement_id, e]));
  const cards = data.statements.filter((s: any) => s.truth_at_exam && !s.review_flag);
  const first = cards[0];
  const cite = (exp.get(first.id) as any).citations.find((c: any) => c.type === "statute");
  const index = await (await request.get("/data/articles.json")).json();
  const n = index.laws[cite.law].articles[cite.article].split(" ").length;

  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  await page.getByRole("button", { name: first.truth_at_exam.value ? "○" : "×", exact: true }).click();
  await page.locator(".page .explanation details summary", { hasText: "引用した条文" }).click();
  await page.locator(".page .article-link").first().click();
  await expect(page.locator("h1")).toContainText(cite.law);
  await expect(page.locator(".article-text")).toContainText("e-Gov 法令 API から取得した現行の条文");
  await expect(page.locator(".article-page")).toContainText(`${n} 枚`);

  // 戻ると、答え合わせの画面のまま（1枚目に答えた状態）
  await page.goBack();
  await expect(page.locator(".page .result")).toBeVisible();
  await expect(page.locator(".toolbar")).toContainText("1 / ");

  // もう一度開いて、この条の肢を解く（新しく始めた回になる）
  await page.locator(".page .article-link").first().click();
  await page.getByRole("button", { name: /この条の肢を解く/ }).click();
  // 条文の画面の裏には前の回の解く画面を隠して残しているので、見えているツールバーだけを見る
  await expect(page.locator(".toolbar:visible")).toContainText(cite.law);
  await expect(page.locator(".toolbar:visible")).toContainText(/\/ \d+/);
  await expect(page.locator(".page .result")).toHaveCount(0);
});

test("科目の画面の「条文から解く」：よく出る条文の一覧と、条の番号で探す", async ({ page }) => {
  await openHome(page);
  await gotoSubject(page, "民法");
  const section = page.locator("details.articles");
  await section.locator("summary").click();
  await expect(section.locator(".article-top li").first()).toContainText("枚");
  await expect(section.locator(".article-top li")).toHaveCount(20);
  await section.getByLabel("条の番号").fill("94");
  await section.getByRole("button", { name: "探す" }).click();
  await expect(page.locator("h1")).toContainText("民法 94条");
  await expect(page.locator("h1")).toContainText("虚偽表示");
});
