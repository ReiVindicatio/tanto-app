import { expect, test } from "@playwright/test";
import { openHome, openYear } from "./helpers";

test("問の解説（T018）：肢ごとの○×が決まらない問は、問で解くの答え合わせに「この問の解説」が出る", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2026-keiho.json")).json();
  const qe = data.question_explanations[0];
  expect(qe).toBeTruthy();
  const target = data.questions.find((q: { id: string }) => q.id === qe.question_id);
  await openHome(page);
  await openYear(page, "刑法", "R08", "問で解く");
  for (const q of data.questions) {
    await expect(page.locator(".question")).toContainText(`第${q.number}問`);
    for (let k = 0; k < q.answer_slots.length; k++) {
      await page.locator(".slot").nth(k).locator("button.opt", { hasText: new RegExp(`^${q.answer_slots[k].official_answer}`) }).click();
    }
    await page.getByRole("button", { name: "採点する" }).click();
    const shown = page.locator(".question-explanation");
    if (q.id === target.id) {
      await expect(shown).toContainText("この問の解説");
      await expect(shown).toContainText("AI が生成した解説");
      await expect(shown).toContainText(qe.conclusion.slice(0, 20));
      await expect(shown).toContainText("公式の正解との一致");
      break;
    }
    await expect(shown).toHaveCount(0);
    await page.getByRole("button", { name: "次へ" }).click();
  }
});

test("問の解説（T018）：問ごとの静的ページにも出る", async ({ request }) => {
  const html = await (await request.get("/q/yobi-2026-keiho-q03/")).text();
  expect(html).toContain("この問の解説");
  expect(html).toContain("公式の正解との一致");
});
