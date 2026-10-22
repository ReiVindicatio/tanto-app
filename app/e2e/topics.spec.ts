import { expect, test } from "@playwright/test";
import { gotoSubject, openHome, totalCards } from "./helpers";

test("分野ごと（T016）：分野の一覧から解く。まちがえた分野が苦手になり、苦手な分野だけをまとめて解ける", async ({ page }) => {
  // 民法の「法律行為」の章の肢（予備の2020年以降）に、まちがえた回答を5件入れておく（回答ログ）
  const topics = await (await page.request.get("/data/topics.json")).json();
  const first = topics.subjects.minpo.find((t: { label: string }) => t.label.endsWith("第五章 法律行為"));
  const recent = (first.cards as string).split(" ").filter((id) => /^yobi-202[0-9]-/.test(id)).slice(0, 5);
  expect(recent).toHaveLength(5);
  await page.addInitScript((ids) => {
    if (localStorage.getItem("tanto.log.v1")) return;
    const log = ids.map((s, i) => ({ id: `t${i}`, s, ok: false, at: `2026-10-20T00:00:0${i}.000Z` }));
    localStorage.setItem("tanto.log.v1", JSON.stringify(log));
  }, recent);

  await openHome(page);
  await gotoSubject(page, "民法");
  const section = page.locator("details.topics");
  await section.locator("summary").click();
  await expect(section.locator(".topic").first()).toBeVisible();
  const row = section.locator(".topic").filter({ hasText: first.label });
  await expect(row).toContainText("回答済み 5枚・前回正解 0%（苦手）");

  // 苦手な順にすると先頭に来る
  await section.getByRole("button", { name: "苦手な順" }).click();
  await expect(section.locator(".topic").first()).toContainText(first.label);

  // 苦手な分野をまとめて解く：その分野の枚数（民法の既定＝2020年以降の年度）だけ出る
  const counts = (await row.innerText()).match(/(\d+)枚・回答済み/)!;
  await section.getByRole("button", { name: /苦手な分野をまとめて解く（1分野・\d+枚）/ }).click();
  expect(await totalCards(page)).toBe(Number(counts[1]));
  await expect(page.locator(".toolbar")).toContainText("民法 苦手な分野");
  await page.getByRole("button", { name: "← 戻る" }).click();

  // 戻ると、開いた状態と並び順（苦手な順）はそのまま。分野ひとつを解く
  await expect(section.locator(".topic").first()).toContainText(first.label);
  const other = section.locator(".topic").nth(1);
  const n = Number((await other.innerText()).match(/(\d+)枚・回答済み/)![1]);
  await other.getByRole("button", { name: "解く" }).click();
  expect(await totalCards(page)).toBe(n);
});
