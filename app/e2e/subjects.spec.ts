import { expect, test } from "@playwright/test";
import { allYearsSet, openHome, openYear, subject } from "./helpers";

test("商法・民訴がホームに出る（T007）", async ({ page }) => {
  await openHome(page);
  await expect(subject(page, "商法")).toBeVisible();
  await expect(subject(page, "民事訴訟法")).toBeVisible();
  await expect(allYearsSet(page, "商法")).toContainText("15年度");
  await expect(allYearsSet(page, "民事訴訟法")).toContainText("15年度");
});

test("記述を説明した選択肢から選ぶ問（民訴 H23 問38）を採点できる", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2011-minso.json")).json();
  const target = data.questions.find((q: any) => q.number === 38);
  expect(target.format).toBe("meta_choice");
  await openHome(page);
  await openYear(page, "民事訴訟法", "H23", "問で解く");
  for (const q of data.questions) {
    if (q.number === 38) break;
    // 「次へ」の直後は前の問の画面が残っていることがあるので、その問の表示を待ってから操作する
    await expect(page.locator(".question")).toContainText(`第${q.number}問`);
    const slots = page.locator(".slot");
    for (let k = 0; k < (await slots.count()); k++) await slots.nth(k).locator("button.opt").nth(k).click();
    await page.getByRole("button", { name: "採点する" }).click();
    await page.getByRole("button", { name: "次へ" }).click();
  }
  await expect(page.locator(".question")).toContainText("第38問");
  await expect(page.locator(".slot").first().locator("button.opt")).toHaveCount(target.choices.length);
  await page.locator(".slot").first().locator("button.opt", { hasText: String(target.answer_slots[0].official_answer) }).click();
  await page.getByRole("button", { name: "採点する" }).click();
  await expect(page.locator(".result .big")).toHaveText(`${target.points} / ${target.points} 点`);
});
