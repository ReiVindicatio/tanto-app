import { expect, test } from "@playwright/test";
import { openHome } from "./helpers";

// 模試（T028）

test("予備の科目群を本番の時間で解き、提出すると受験者の平均点と比べた結果が出て、履歴に残る", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: /模試（本番の時間で解く）/ }).click();
  await expect(page.locator("h1")).toHaveText("模試（本番の時間で解く）");
  const unit = page.locator(".mock-year").first().getByRole("button", { name: /憲法・行政法/ });
  await expect(unit).toContainText("60分");
  await unit.click();
  await expect(page.locator(".mock-clock")).toContainText(/残り (60:00|59:5\d)/);
  // 1問目の最初の選択肢を選んで、問の一覧で「答えた」になる
  await page.locator(".slot").first().locator("button.opt").first().click();
  await expect(page.locator(".mock-palette button").first()).toHaveClass(/answered/);
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator(".mock-palette button").nth(1)).toHaveClass(/current/);
  page.once("dialog", (d) => d.accept());
  await page.locator(".toolbar").getByRole("button", { name: "提出する" }).click();
  await expect(page.locator("h1")).toHaveText("模試の結果");
  await expect(page.locator(".mock-subjects")).toContainText("平均点");
  await expect(page.locator(".mock-note")).toContainText("一般教養科目を含む");
  await page.getByRole("button", { name: "戻る" }).click();
  await expect(page.locator(".mock-year").first().getByRole("button", { name: /憲法・行政法/ })).toContainText(/前回 \d+\/\d+/);
});

test("司法の科目は、最低ラインと受験者の中での位置も出る。時間が来たら自動で採点する", async ({ page }) => {
  await page.clock.install();
  await openHome(page);
  await page.getByRole("button", { name: /模試（本番の時間で解く）/ }).click();
  await page.getByRole("button", { name: "司法試験" }).click();
  await page.locator(".mock-year").first().getByRole("button", { name: /^民法/ }).click();
  await expect(page.locator(".mock-clock")).toContainText("残り");
  await page.clock.fastForward("01:16:00");
  await expect(page.locator("h1")).toHaveText("模試の結果");
  await expect(page.locator(".mock-result")).toContainText("時間切れで採点しました");
  await expect(page.locator(".mock-subjects")).toContainText("最低ライン");
  await expect(page.locator(".mock-subjects")).toContainText("上位");
});
