import { expect, test } from "@playwright/test";
import { allYearsSet, gotoSubject, openHome, reviewSet, totalCards } from "./helpers";

test("全年度モード・絞り込み・改正前の切り替え・再読み込み後の履歴", async ({ page }) => {
  await openHome(page);
  await gotoSubject(page, "民法");
  // 2020年以降の6年度。要確認（data/review/flags.json）の肢は肢カードから外れる（R03 問13エ：出題後の改正で正誤が変わる）
  await expect(allYearsSet(page)).toContainText("7年度・肢カード 524枚・回答済み 0枚");
  await allYearsSet(page).getByRole("button", { name: /肢で解く/ }).click();
  for (let k = 0; k < 5; k++) {
    await page.getByRole("button", { name: "○", exact: true }).click();
    await page.getByRole("button", { name: "次へ" }).click();
  }
  await page.getByRole("button", { name: "← 戻る" }).click();
  const after = await allYearsSet(page).innerText();
  expect(after).toContain("回答済み 5枚");
  await page.reload(); // 科目の画面の URL のまま再読み込みしても、同じ画面に戻る（T025）
  await expect(allYearsSet(page)).toContainText("回答済み 5枚");
  const wrong = 5 - Number(after.match(/前回正解\s*(\d+)/)![1]);
  await page.getByRole("button", { name: "前回まちがえたものだけ" }).click();
  await allYearsSet(page).getByRole("button", { name: /肢で解く/ }).click();
  if (wrong === 0) await expect(page.getByText("出題できる肢がありません")).toBeVisible();
  else expect(await totalCards(page)).toBe(wrong);
  await page.getByRole("button", { name: /戻る/ }).first().click();
  await page.getByRole("button", { name: "すべて", exact: true }).click();
  await allYearsSet(page).getByRole("checkbox").check();
  await expect(allYearsSet(page)).toContainText("16年度・肢カード");
});

test("今日の復習：新規20枚・同じ問は1枚まで・回答ログから作り直し", async ({ page }) => {
  await openHome(page);
  await gotoSubject(page, "民法");
  await expect(reviewSet(page)).toContainText("期限が来た肢 0枚・今日の新規の残り 20枚");
  await reviewSet(page).getByRole("button", { name: "復習をはじめる" }).click();
  const n = await totalCards(page);
  expect(n).toBe(20);
  const questions = new Set<string>();
  for (let k = 0; k < n; k++) {
    questions.add(await page.locator("main .muted.small").first().innerText());
    await page.getByRole("button", { name: k % 3 === 0 ? "×" : "○", exact: true }).click();
    await page.getByRole("button", { name: "次へ" }).click();
  }
  expect(questions.size).toBe(20);
  await page.getByRole("button", { name: "戻る" }).click();
  await expect(reviewSet(page)).toContainText("今日の新規の残り 0枚");
  await gotoSubject(page, "刑法");
  await expect(reviewSet(page)).toContainText("今日の新規の残り 20枚"); // 新規の枠は科目ごと
  await gotoSubject(page, "民法");
  await page.reload();
  await expect(reviewSet(page)).toContainText("期限が来た肢 0枚・今日の新規の残り 0枚");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["tanto.log.v1"]);
  // 回答ログの日時を30日前にずらすと、FSRS の期限と新規の数がログから作り直される
  await page.evaluate(() => {
    const log = JSON.parse(localStorage.getItem("tanto.log.v1")!);
    for (const a of log) a.at = new Date(new Date(a.at).getTime() - 30 * 86400000).toISOString();
    localStorage.setItem("tanto.log.v1", JSON.stringify(log));
  });
  await page.reload();
  await expect(reviewSet(page)).toContainText("期限が来た肢 20枚・今日の新規の残り 20枚");
});

test("旧形式の記録は回答ログに変換され、旧データは tanto.legacy.* に残る", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("tanto.history.v1", JSON.stringify({
      "yobi-2026-minpo-q01-a": { attempts: 3, correct: 2, last: true, at: "2026-10-01T10:00:00.000Z" },
      "yobi-2026-minpo-q01-b": { attempts: 1, correct: 0, last: false, at: "2026-10-02T10:00:00.000Z" },
      "yobi-2024-minpo-q02-c": { attempts: 2, correct: 2, last: true, at: "2026-10-03T10:00:00.000Z" },
    }));
    localStorage.setItem("tanto.srs.v1", "{}");
  });
  await page.reload();
  await gotoSubject(page, "民法");
  await expect(allYearsSet(page)).toContainText("回答済み 3枚（前回正解 2枚）");
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toEqual(["tanto.legacy.history.v1", "tanto.legacy.srs.v1", "tanto.log.v1"]);
});
