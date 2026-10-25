import { expect, test } from "@playwright/test";
import { openHome, openYear, tab } from "./helpers";

// ひっかけの型（T059）

test("×の肢に答えると、ひっかけの型（AI による分類）が出る。○の肢には出ない", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2026-minpo.json")).json();
  const traps = await (await request.get("/data/traps.json")).json();
  const cards = data.statements.filter((s: any) => s.truth_at_exam && !s.review_flag);
  const k = cards.findIndex((s: any) => s.truth_at_exam.value === false && traps.items[s.id]);
  const firstTrue = cards.findIndex((s: any) => s.truth_at_exam.value === true);
  expect(k).toBeGreaterThanOrEqual(0);
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  for (let n = 0; n <= Math.max(k, firstTrue); n++) {
    await page.getByRole("button", { name: cards[n].truth_at_exam.value ? "○" : "×", exact: true }).click();
    await expect(page.locator(".page .result")).toBeVisible();
    if (n === k) {
      await expect(page.locator(".page .trap-note")).toContainText(traps.types[traps.items[cards[n].id][0]].name);
      await expect(page.locator(".page .trap-note")).toContainText("AI による分類");
    }
    if (n === firstTrue) await expect(page.locator(".page .trap-note")).toHaveCount(0);
    await page.getByRole("button", { name: "次へ" }).click();
  }
});

test("マイページの「まちがえやすい型」：同じ型の×の肢に5枚ひっかかると出て、その型を解ける", async ({ page, request }) => {
  const traps = await (await request.get("/data/traps.json")).json();
  // 2020年以降の民法の「要件の付け足し」の×の肢5枚に、まちがえた回答を入れておく
  const ids = Object.entries(traps.items)
    .filter(([id, v]: [string, any]) => v[0] === "add_requirement" && /^yobi-202\d-minpo-/.test(id))
    .slice(0, 5)
    .map(([id]) => id);
  expect(ids).toHaveLength(5);
  await page.addInitScript((ids) => {
    if (localStorage.getItem("tanto.log.v1")) return;
    localStorage.setItem("tanto.log.v1", JSON.stringify(ids.map((s, i) => ({ id: `t${i}`, s, ok: false, at: `2026-10-24T00:00:0${i}.000Z` }))));
  }, ids);
  await openHome(page);
  await tab(page, "マイページ").click();
  const row = page.locator(".trap-list li").filter({ hasText: "要件の付け足し" });
  await expect(row).toContainText("ひっかかった 5 / 5枚（100%）");
  await row.getByRole("button", { name: "この型を解く" }).click();
  await expect(page.locator(".toolbar")).toContainText("型：要件の付け足し");
  const total = Number((await page.locator(".toolbar").innerText()).match(/\/ (\d+)/)![1]);
  expect(total % 2).toBe(0); // その型の×の肢と、同じ数のほかの肢
});
