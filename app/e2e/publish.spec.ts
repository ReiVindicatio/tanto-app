import { expect, test } from "@playwright/test";
import { allYearsSet, gotoSubject, openHome, tab } from "./helpers";

// 公開の準備（T040）：規約・プライバシーポリシー・この端末の記録を消す・誤り報告（ログインしていないとき）

test("フッターとマイページから、利用規約とプライバシーポリシーを開ける", async ({ page }) => {
  await openHome(page);
  await page.locator(".footer").getByRole("button", { name: "利用規約" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.locator("h1")).toHaveText("利用規約");
  await expect(page.locator(".legal")).toContainText("AI が生成したもの");
  await page.getByRole("button", { name: "← 戻る" }).click();

  await tab(page, "マイページ").click();
  await page.locator(".legal-links").getByRole("button", { name: "プライバシーポリシー" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator("h1")).toHaveText("プライバシーポリシー");
  await expect(page.locator(".legal")).toContainText("学習の記録は運営者のサーバーに送らず");
  await expect(page.locator(".legal")).toContainText("Cloudflare Web Analytics で集計します。Cookie を使わず"); // T046
  await expect(tab(page, "マイページ")).toHaveClass(/active/); // マイページの続きとして開く
});

test("ログインしていなければ「この端末の記録を消す」で、端末の記録だけ消える", async ({ page }) => {
  await openHome(page);
  await gotoSubject(page, "民法");
  await allYearsSet(page).getByRole("button", { name: /肢で解く/ }).click();
  for (let k = 0; k < 2; k++) {
    await page.getByRole("button", { name: "○", exact: true }).click();
    await page.getByRole("button", { name: "次へ" }).click();
  }
  await page.getByRole("button", { name: "← 戻る" }).click();
  await expect(allYearsSet(page)).toContainText("回答済み 2枚");

  await tab(page, "マイページ").click();
  await expect(page.getByRole("button", { name: "記録を全部消す（退会）" })).toHaveCount(0);
  await page.getByRole("button", { name: "この端末の記録を消す" }).click();
  await expect(page.locator(".delete-confirm")).toContainText("回答 2 件");
  page.once("dialog", (d) => d.dismiss()); // 2回目の確認でやめると、消さない
  await page.locator(".delete-confirm").getByRole("button", { name: "消す" }).click();
  await expect(page.locator(".card").first()).toContainText("累計 2 肢");

  page.once("dialog", (d) => d.accept());
  await page.locator(".delete-confirm").getByRole("button", { name: "消す" }).click();
  await expect(page.locator(".delete-data")).toContainText("記録を全部消しました");
  await expect(page.locator(".card").first()).toContainText("累計 0 肢");
});

test("誤り報告：答え合わせのあとに出る。ログインしていなければログインを促す", async ({ page }) => {
  await openHome(page);
  await gotoSubject(page, "民法");
  await allYearsSet(page).getByRole("button", { name: /肢で解く/ }).click();
  await expect(page.getByRole("button", { name: "誤りを報告" })).toHaveCount(0); // 答える前は出さない
  await page.getByRole("button", { name: "○", exact: true }).click();
  await page.getByRole("button", { name: "誤りを報告" }).click();
  await expect(page.locator(".report-form")).toContainText("ログインすると、誤りを報告できます");
  await expect(page.locator(".report-form textarea")).toHaveCount(0);
});
