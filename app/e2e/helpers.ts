import { expect, type Page } from "@playwright/test";

/** ホームを開き、データの読み込みを待つ */
export async function openHome(page: Page) {
  await page.goto("/");
  await expect(page.locator(".hero-breakdown")).not.toContainText("読み込み中");
}

/** 画面下のタブ（T025） */
export const tab = (page: Page, name: "ホーム" | "科目" | "マイページ") => page.locator("nav.tabbar").getByRole("button", { name });

/** 科目の一覧のカード */
export const subjectCard = (page: Page, name: string) =>
  page.locator(".subject-card").filter({ has: page.locator(".subject-name", { hasText: new RegExp(`^${name}$`) }) });

/** 科目タブから科目の画面を開く */
export async function gotoSubject(page: Page, name: string) {
  await tab(page, "科目").click();
  await subjectCard(page, name).click();
  await expect(page.locator("h1.subject-title")).toContainText(name);
}

/** 科目の画面を開いて、年度の「肢で解く」「問で解く」を押す */
export async function openYear(page: Page, subj: string, era: string, button: "肢で解く" | "問で解く") {
  await gotoSubject(page, subj);
  const set = page.locator(".set.year").filter({ has: page.locator(".set-title", { hasText: era }) });
  await set.getByRole("button", { name: new RegExp(button) }).click();
}

/** 科目の画面の「全年度から」「今日の復習」の欄 */
export const allYearsSet = (page: Page) => page.locator(".set").filter({ hasText: "全年度から" });
export const reviewSet = (page: Page) => page.locator(".set.review");

/** ツールバーの「i / n」の n */
export async function totalCards(page: Page): Promise<number> {
  // 年度の束は解くときに読むので（T038）、解く画面に切り替わって「1 / N」が出るのを待つ
  await expect(page.locator(".toolbar")).toContainText(/\/ \d+/);
  const t = await page.locator(".toolbar").innerText();
  return Number(t.match(/\/ (\d+)/)![1]);
}
