import { expect, test } from "@playwright/test";
import { openHome, openYear, tab } from "./helpers";

test("マイページ：学習の軌跡・科目ごと・まちがえた肢をまとめて解く（T024・T034）", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2026-minpo.json")).json();
  const truth = new Map<string, boolean>(
    data.statements.filter((s: any) => s.truth_at_exam).map((s: any) => [s.text, s.truth_at_exam.value]),
  );
  await openHome(page);
  await tab(page, "マイページ").click();
  await expect(page.locator(".card").first()).toContainText("連続 0 日");
  await expect(page.locator(".subject-stat").filter({ hasText: "民法" })).toContainText("回答済み 0 / ");
  await expect(page.getByText("正答率")).toHaveCount(0); // T034：マイページに正答率は出さない
  await expect(page.locator(".heatmap rect").first()).toBeVisible();

  // 民法 R08 を3枚：1枚目と2枚目はわざとまちがえ、3枚目は正しく答える
  await openYear(page, "民法", "R08", "肢で解く");
  for (let k = 0; k < 3; k++) {
    const t = truth.get(await page.locator(".statement").innerText())!;
    await page.getByRole("button", { name: (k < 2 ? !t : t) ? "○" : "×", exact: true }).click();
    await page.getByRole("button", { name: "次へ" }).click();
  }
  await page.getByRole("button", { name: "← 戻る" }).click();
  await tab(page, "マイページ").click();
  await expect(page.locator(".card").first()).toContainText("連続 1 日");
  await expect(page.locator(".card").first()).toContainText("累計 3 肢");
  await expect(page.locator(".heatmap rect.heat-1")).toHaveCount(1); // 今日のマス
  await expect(page.locator(".climb")).toBeVisible();
  await expect(page.locator(".subject-stat").filter({ hasText: "民法" })).toContainText("回答済み 3 / ");
  await expect(page.locator(".wrong-total")).toContainText("2 枚");
  await page.getByRole("button", { name: "まちがえた肢をまとめて解く" }).click();
  await expect(page.locator(".toolbar")).toContainText("まちがえた肢　1 / 2");
});
