import { expect, test } from "@playwright/test";
import { openHome, openYear, subjectCard, tab } from "./helpers";

test("商法・民訴がホームに出る（T007）", async ({ page }) => {
  await openHome(page);
  await tab(page, "科目").click();
  await expect(subjectCard(page, "商法")).toContainText("16年度");
  await expect(subjectCard(page, "民事訴訟法")).toContainText("16年度");
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

test("7科目とも科目に出る（T009・T033・T010：各16年度）", async ({ page }) => {
  await openHome(page);
  await tab(page, "科目").click();
  for (const name of ["民法", "商法", "民事訴訟法", "刑法", "刑事訴訟法", "憲法", "行政法"]) {
    await expect(subjectCard(page, name)).toContainText("16年度");
  }
});

test("刑訴 R02 を問で解く：肢のない問（人数・発言者の組合せ）も含めて、公式の解答で満点になる", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2020-keiso.json")).json();
  const noStatements = data.questions.filter((q: any) => q.format === "meta_choice" && !data.statements.some((s: any) => s.question_id === q.id));
  expect(noStatements.length).toBeGreaterThan(0);
  await openHome(page);
  await openYear(page, "刑事訴訟法", "R02", "問で解く");
  for (const q of data.questions) {
    await expect(page.locator(".question")).toContainText(`第${q.number}問`);
    for (let k = 0; k < q.answer_slots.length; k++) {
      await page.locator(".slot").nth(k).locator("button.opt", { hasText: new RegExp(`^${q.answer_slots[k].official_answer}`) }).click();
    }
    await page.getByRole("button", { name: "採点する" }).click();
    await expect(page.locator(".result .big")).toHaveText(`${q.points} / ${q.points} 点`);
    await page.getByRole("button", { name: "次へ" }).click();
  }
  await expect(page.getByText("30 / 30 点")).toBeVisible();
});

test("区分を選ぶ形式（刑法 H24 問4）：区分の一覧が出て、公式の解答で満点になる（T033）", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2012-keiho.json")).json();
  const target = data.questions.find((q: any) => q.number === 4);
  expect(target.format).toBe("classify_each");
  await openHome(page);
  await openYear(page, "刑法", "H24", "問で解く");
  for (const q of data.questions) {
    if (q.number === 4) break;
    await expect(page.locator(".question")).toContainText(`第${q.number}問`);
    for (let k = 0; k < q.answer_slots.length; k++) {
      await page.locator(".slot").nth(k).locator("button.opt", { hasText: new RegExp(`^${q.answer_slots[k].official_answer}`) }).click();
    }
    await page.getByRole("button", { name: "採点する" }).click();
    await page.getByRole("button", { name: "次へ" }).click();
  }
  await expect(page.locator(".question")).toContainText("第4問");
  await expect(page.locator(".classes")).toContainText("3：間接正犯が成立する場合");
  for (let k = 0; k < target.answer_slots.length; k++) {
    await page.locator(".slot").nth(k).locator("button.opt", { hasText: String(target.answer_slots[k].official_answer) }).click();
  }
  await page.getByRole("button", { name: "採点する" }).click();
  await expect(page.locator(".result .big")).toHaveText(`${target.points} / ${target.points} 点`);
  await expect(page.locator(".law-note")).toContainText("拘禁刑の導入");
});

test("○×の組合せの問（行政法 H29）：肢カードになり、問で解くでも公式の解答で満点になる（T035）", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2017-gyosei.json")).json();
  const marks = data.questions.filter((q: any) => q.format === "mark_combination");
  expect(marks.length).toBeGreaterThan(0);
  // 肢の○×は、正解の選択肢に書かれた○×そのもの
  for (const q of marks) {
    const chosen = q.choices[q.answer_slots[0].official_answer - 1].marks;
    for (const s of data.statements.filter((x: any) => x.question_id === q.id)) {
      expect(s.truth_at_exam.value).toBe(chosen.find((m: any) => m.label === s.label).value);
    }
  }
  await openHome(page);
  await openYear(page, "行政法", "H29", "問で解く");
  const total = data.questions.reduce((n: number, q: any) => n + q.points, 0);
  for (const q of data.questions) {
    await expect(page.locator(".question")).toContainText(`第${q.number}問`);
    for (let k = 0; k < q.answer_slots.length; k++) {
      await page.locator(".slot").nth(k).locator("button.opt", { hasText: new RegExp(`^${q.answer_slots[k].official_answer}`) }).click();
    }
    await page.getByRole("button", { name: "採点する" }).click();
    await expect(page.locator(".result .big")).toHaveText(`${q.points} / ${q.points} 点`);
    await page.getByRole("button", { name: "次へ" }).click();
  }
  await expect(page.getByText(`${total} / ${total} 点`)).toBeVisible();
});

test("司法試験：科目の画面で予備・司法を切り替え、同じ肢は1枚のカードにまとめる（T011・決定018）", async ({ page, request }) => {
  const index = await (await request.get("/data/index.json")).json();
  const shihoMinpo = index.sets.filter((s: any) => s.exam.type === "shiho" && s.subject === "minpo");
  expect(shihoMinpo.length).toBe(12);
  const aliases: Record<string, string> = index.aliases;
  expect(Object.keys(aliases).filter((k) => k.startsWith("shiho-")).length).toBeGreaterThan(1000);

  await openHome(page);
  await tab(page, "科目").click();
  await expect(subjectCard(page, "民法")).toContainText("予備16年度・司法12年度");
  await subjectCard(page, "民法").click();
  await expect(page.locator(".set.year")).toHaveCount(16);
  await page.getByRole("button", { name: "司法（12年度）" }).click();
  await expect(page.locator(".set.year")).toHaveCount(12);
  await expect(page.locator(".set.year").first()).toContainText("司法 R08（2026）");

  // 司法 R08 民法：予備と同じ肢には、同じ肢の出典が出る
  const data = await (await request.get("/data/shiho-2026-minpo.json")).json();
  const cards = data.statements.filter((s: any) => s.truth_at_exam && !s.review_flag);
  const k = cards.findIndex((s: any) => s.same_as?.length);
  expect(k).toBeGreaterThanOrEqual(0);
  await page.locator(".set.year").first().getByRole("button", { name: "肢で解く" }).click();
  for (let i = 0; i <= k; i++) {
    await page.getByRole("button", { name: "○", exact: true }).click();
    if (i < k) await page.getByRole("button", { name: "次へ" }).click();
  }
  await expect(page.locator(".same-as")).toContainText(`${cards[k].same_as[0].exam} ${cards[k].same_as[0].era}`);
});
