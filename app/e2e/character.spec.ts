import { expect, test } from "@playwright/test";
import { openHome, openYear, tab } from "./helpers";

// キャラクター（T063）：肢で解くの答え合わせ（欄の縁からのぞく律と吹き出し）・ホームの案内・はじき方の初回案内と、マイページの出す・出さない

async function truthOf(request: any) {
  const data = await (await request.get("/data/yobi-2026-minpo.json")).json();
  return new Map<string, boolean>(data.statements.filter((s: any) => s.truth_at_exam && !s.review_flag).map((s: any) => [s.text, s.truth_at_exam.value]));
}

test("答え合わせ：正解で喜び・不正解で残念、2問続けて不正解ならジト目のちびキャラ。マイページで出さないにすると消える", async ({ page, request }) => {
  const truth = await truthOf(request);
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  const chibi = page.locator(".page .result .drill-char");
  // はじき方の案内は、初めての1回だけ律の吹き出しで
  await expect(page.locator(".page .ritsu-says.swipe-hint")).toBeVisible();

  let text = await page.locator(".page .statement").innerText();
  await page.keyboard.press(truth.get(text) ? "ArrowRight" : "ArrowLeft");
  await expect(chibi).toHaveAttribute("data-face", "happy");
  await expect(page.locator(".page .result .peek-bubble")).toHaveText("正解！");
  await page.keyboard.press("Enter");

  for (const expected of ["sad", "jito"]) {
    await expect(page.locator(".page .statement")).not.toHaveText(text);
    text = await page.locator(".page .statement").innerText();
    await page.keyboard.press(truth.get(text) ? "ArrowLeft" : "ArrowRight"); // わざとまちがえる
    await expect(chibi).toHaveAttribute("data-face", expected);
    await page.keyboard.press("Enter");
  }

  await page.getByRole("button", { name: "← 戻る" }).click();
  // 2回目からは、はじき方の案内は今までどおりの小さな文字
  await openYear(page, "民法", "R08", "肢で解く");
  await expect(page.locator(".page p.swipe-hint")).toBeVisible();
  await expect(page.locator(".page .ritsu-says")).toHaveCount(0);
  await page.getByRole("button", { name: "← 戻る" }).click();
  await tab(page, "ホーム").click();
  await expect(page.locator(".hero .ritsu-bubble")).toContainText(/今日はどこからやる|復習の肢が|今日の分、おわってる/);
  await tab(page, "マイページ").click();
  await page.getByRole("group", { name: "キャラクター" }).getByRole("button", { name: "出さない" }).click();
  await openYear(page, "民法", "R08", "肢で解く");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".page .result")).toBeVisible();
  await expect(chibi).toHaveCount(0);
  await expect(page.locator(".page .result .big")).toHaveText(/^(不)?正解$/);
  await page.getByRole("button", { name: "← 戻る" }).click();
  await tab(page, "ホーム").click();
  await expect(page.locator(".ritsu-says")).toHaveCount(0);
});
