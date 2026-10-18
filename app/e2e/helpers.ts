import { expect, type Page } from "@playwright/test";

export async function openHome(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "どれを解く？" })).toBeVisible();
  await expect(page.locator(".set").first()).toBeVisible();
}

/** 科目の欄 */
export const subject = (page: Page, name: string) => page.locator(".subject").filter({ has: page.locator("h2", { hasText: name }) });

/** 年度ごとの欄を開いて、その年度のボタンを押す */
export async function openYear(page: Page, subj: string, era: string, button: "肢で解く" | "問で解く") {
  const s = subject(page, subj);
  // 年度が1つだけの科目は最初から開いているので、クリックで切り替えず「開いた状態」にする
  await s.locator("details").evaluate((d) => ((d as HTMLDetailsElement).open = true));
  const set = s.locator(".set").filter({ has: page.locator(".set-title", { hasText: era }) });
  await set.getByRole("button", { name: new RegExp(button) }).click();
}

export const allYearsSet = (page: Page, subj: string) => subject(page, subj).locator(".set").filter({ hasText: "全年度から" });
export const reviewSet = (page: Page, subj: string) => subject(page, subj).locator(".set.review");

/** ツールバーの「i / n」の n */
export async function totalCards(page: Page): Promise<number> {
  const t = await page.locator(".toolbar").innerText();
  return Number(t.match(/\/ (\d+)/)![1]);
}
