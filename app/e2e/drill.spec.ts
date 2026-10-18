import { expect, test } from "@playwright/test";
import { openHome, openYear } from "./helpers";

test("肢で解く：データの○×どおりに答えると全問正解（民法 R08）", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2026-minpo.json")).json();
  const truth = new Map<string, boolean>(
    data.statements.filter((s: any) => s.truth_at_exam && !s.review_flag).map((s: any) => [s.text, s.truth_at_exam.value]),
  );
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  const n = truth.size;
  for (let k = 0; k < n; k++) {
    const text = await page.locator(".statement").innerText();
    await page.getByRole("button", { name: truth.get(text) ? "○" : "×", exact: true }).click();
    await expect(page.locator(".result")).toBeVisible();
    if (k === 0) {
      await expect(page.locator(".ai-badge")).toHaveText("AI が生成した解説"); // 解説と AI 生成の表示
    }
    await page.getByRole("button", { name: "次へ" }).click();
  }
  await expect(page.getByText(`${n} / ${n} 正解`)).toBeVisible();
});

test("問で解く：誤答・順不同の逆順・部分点の採点（刑法 R08）", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2026-keiho.json")).json();
  await openHome(page);
  await openYear(page, "刑法", "R08", "問で解く");
  const scores: string[] = [];
  for (const q of data.questions) {
    let picks: number[] = q.answer_slots.map((s: any) => s.official_answer);
    if (q.unordered) picks = [...picks].reverse(); // 順不同：逆順でも満点
    if (q.number === 13 || q.number === 1) picks[0] = picks[0] === 1 ? 2 : 1; // 問13は4問正解→部分点、問1は誤答
    for (let k = 0; k < picks.length; k++) {
      await page.locator(".slot").nth(k).locator("button.opt", { hasText: new RegExp(`^${picks[k]}`) }).click();
    }
    await page.getByRole("button", { name: "採点する" }).click();
    scores.push(await page.locator(".result .big").innerText());
    await page.getByRole("button", { name: "次へ" }).click();
  }
  expect(scores[0]).toBe("0 / 2 点");
  expect(scores[1]).toBe("3 / 3 点");
  expect(scores[12]).toBe("2 / 4 点");
  await expect(page.getByText("26 / 30 点")).toBeVisible();
});

test("小問つきの問（民法 H26 問5）：小問ごとに選んで採点できる", async ({ page }) => {
  await openHome(page);
  await openYear(page, "民法", "H26", "問で解く");
  for (let n = 1; n < 5; n++) {
    await page.locator(".slot").first().locator("button.opt").first().click();
    await page.getByRole("button", { name: "採点する" }).click();
    await page.getByRole("button", { name: "次へ" }).click();
  }
  await expect(page.locator(".slot")).toHaveCount(2);
  await expect(page.locator(".slot").nth(0)).toContainText("小問⑴");
  await expect(page.locator(".slot").nth(0).locator("button.opt")).toHaveCount(3);
  await page.locator(".slot").nth(0).locator("button.opt", { hasText: "2" }).click();
  await page.locator(".slot").nth(1).locator("button.opt", { hasText: "3" }).click();
  await page.getByRole("button", { name: "採点する" }).click();
  await expect(page.locator(".result .big")).toHaveText("2 / 2 点");
  await expect(page.locator(".law-note")).toContainText("債権関係"); // 改正前の注意
});
