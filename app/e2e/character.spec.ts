import { expect, test } from "@playwright/test";
import { openHome, openYear, tab } from "./helpers";

// キャラクター（T063）：肢で解くの答え合わせのちびキャラと、マイページの出す・出さない

async function truthOf(request: any) {
  const data = await (await request.get("/data/yobi-2026-minpo.json")).json();
  return new Map<string, boolean>(data.statements.filter((s: any) => s.truth_at_exam && !s.review_flag).map((s: any) => [s.text, s.truth_at_exam.value]));
}

test("答え合わせ：正解で喜び・不正解で残念、2問続けて不正解ならジト目のちびキャラ。マイページで出さないにすると消える", async ({ page, request }) => {
  const truth = await truthOf(request);
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  const chibi = page.locator(".page .result .drill-char");

  let text = await page.locator(".page .statement").innerText();
  await page.keyboard.press(truth.get(text) ? "ArrowRight" : "ArrowLeft");
  await expect(chibi).toHaveAttribute("data-face", "happy");
  await page.keyboard.press("Enter");

  for (const expected of ["sad", "jito"]) {
    await expect(page.locator(".page .statement")).not.toHaveText(text);
    text = await page.locator(".page .statement").innerText();
    await page.keyboard.press(truth.get(text) ? "ArrowLeft" : "ArrowRight"); // わざとまちがえる
    await expect(chibi).toHaveAttribute("data-face", expected);
    await page.keyboard.press("Enter");
  }

  await page.getByRole("button", { name: "← 戻る" }).click();
  await tab(page, "マイページ").click();
  await page.getByRole("group", { name: "キャラクター" }).getByRole("button", { name: "出さない" }).click();
  await openYear(page, "民法", "R08", "肢で解く");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".page .result")).toBeVisible();
  await expect(chibi).toHaveCount(0);
});
