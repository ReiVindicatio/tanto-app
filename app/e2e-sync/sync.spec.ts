import { expect, test, type Browser, type Page } from "@playwright/test";

/** 民法の科目の画面の「全年度から」の欄（T025：科目の画面の URL を直接開く） */
const allYears = (page: Page) => page.locator(".set").filter({ hasText: "全年度から" });
const myPage = (page: Page) => page.locator("nav.tabbar").getByRole("button", { name: "マイページ" });

/** テスト用ログインの利用者 ID を入れた状態で開く（本番のビルドには入らない仕組み） */
async function openAs(browser: Browser, user: string | null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  if (user) await ctx.addInitScript((u) => localStorage.setItem("tanto.testUser", u), user);
  const page = await ctx.newPage();
  await page.goto("/subjects/minpo");
  await expect(allYears(page)).toBeVisible();
  return page;
}

/** 画面を隠す（別のアプリに切り替えた）→ 戻す。隠したときに未送信が送られる（T021） */
async function hideAndShow(page: Page) {
  const set = (state: string) =>
    page.evaluate((v) => {
      Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  await set("hidden");
  await set("visible");
}

async function answer(page: Page, n: number) {
  await allYears(page).getByRole("button", { name: /肢で解く/ }).click();
  for (let k = 0; k < n; k++) {
    await page.getByRole("button", { name: "○", exact: true }).click();
    await page.getByRole("button", { name: "次へ" }).click();
  }
  await page.getByRole("button", { name: "← 戻る" }).click();
}

test("2つのブラウザで同じ利用者なら、片方で解いた記録がもう片方に出る", async ({ browser }) => {
  const phone = await openAs(browser, "alice");
  await myPage(phone).click(); // ログイン中の名前はマイページ（設定）に出る
  await phone.getByRole("tab", { name: "設定" }).click(); // マイページは「記録」「設定」に分けた（T065）
  await expect(phone.locator(".authbar")).toContainText("テスト利用者 alice");
  await phone.goBack();
  await expect(phone.locator(".sync-status")).toContainText("同期済み"); // 起動時の同期が終わってから数える
  const apiCalls: string[] = [];
  phone.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await answer(phone, 10);
  await expect(phone.locator(".sync-status")).toContainText("未送信 10 件"); // 回答のたびには送らない
  expect(apiCalls).toEqual([]);
  await hideAndShow(phone);
  await expect(phone.locator(".sync-status")).toContainText("同期済み");
  expect(apiCalls).toEqual(["POST /api/answers"]); // まとめて1回。戻ったときは5分たっていないので受け取らない

  const pc = await openAs(browser, "alice");
  await expect(allYears(pc)).toContainText("回答済み 10枚");

  // 別の利用者には見えない
  const other = await openAs(browser, "bob");
  await expect(other.locator(".sync-status")).toContainText("同期済み");
  await expect(allYears(other)).toContainText("回答済み 0枚");
});

test("★（T026）：片方のブラウザで付けた★が、同じ利用者のもう片方に出る。外すと消える", async ({ browser }) => {
  const phone = await openAs(browser, "frank");
  await expect(phone.locator(".sync-status")).toContainText("同期済み");
  await allYears(phone).getByRole("button", { name: /肢で解く/ }).click();
  await phone.getByRole("button", { name: "○", exact: true }).click();
  await phone.getByRole("button", { name: "あとで見直す（★を付ける）" }).click();
  await phone.getByRole("button", { name: "← 戻る" }).click();
  await expect(phone.locator(".sync-status")).toContainText("未送信 2 件"); // 回答1件と★の操作1件
  await hideAndShow(phone);
  await expect(phone.locator(".sync-status")).toContainText("同期済み");

  const pc = await openAs(browser, "frank");
  await expect(pc.locator(".sync-status")).toContainText("同期済み");
  await pc.locator("nav.tabbar").getByRole("button", { name: "ホーム" }).click();
  await expect(pc.getByRole("button", { name: "★を付けた肢を解く（1枚）" })).toBeVisible();

  // PC で外す → スマホにも反映される
  await pc.getByRole("button", { name: "★を付けた肢を解く（1枚）" }).click();
  await pc.getByRole("button", { name: "○", exact: true }).click();
  await pc.getByRole("button", { name: "★を外す" }).click();
  await pc.getByRole("button", { name: "← 戻る" }).click();
  await hideAndShow(pc);
  await expect(pc.locator(".sync-status")).toContainText("同期済み");
  const phone2 = await openAs(browser, "frank");
  await expect(phone2.locator(".sync-status")).toContainText("同期済み");
  await phone2.locator("nav.tabbar").getByRole("button", { name: "ホーム" }).click();
  await expect(phone2.locator("main")).toContainText("今日の");
  await expect(phone2.getByRole("button", { name: /★を付けた肢を解く/ })).toHaveCount(0);
});

test("ログイン前に解いた記録は、ログインするとアカウントに引き継がれ、ログアウトで端末から消える", async ({ browser }) => {
  const page = await openAs(browser, null);
  await answer(page, 2);
  await expect(allYears(page)).toContainText("回答済み 2枚");
  await myPage(page).click();
  await page.getByRole("tab", { name: "設定" }).click(); // マイページは「記録」「設定」に分けた（T065）
  page.once("dialog", (d) => d.accept("carol")); // テスト用ログインの利用者 ID
  await page.getByRole("button", { name: "Google でログイン" }).click();
  await expect(page.locator(".sync-status")).toContainText("同期済み");

  const second = await openAs(browser, "carol");
  await expect(allYears(second)).toContainText("回答済み 2枚");

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("button", { name: "Google でログイン" })).toBeVisible();
  await page.goBack();
  await expect(allYears(page)).toContainText("回答済み 0枚");
});

test("誤り報告を送れる（T040）", async ({ browser }) => {
  const page = await openAs(browser, "dave");
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  await allYears(page).getByRole("button", { name: /肢で解く/ }).click();
  await page.getByRole("button", { name: "○", exact: true }).click();
  await page.getByRole("button", { name: "誤りを報告" }).click();
  await page.locator(".report-form").getByRole("button", { name: "解説" }).click();
  await page.getByLabel("報告の内容").fill("条文の番号が違うようです");
  const sent = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/reports" && r.request().method() === "POST");
  await page.locator(".report-form").getByRole("button", { name: "送る" }).click();
  expect((await sent).status()).toBe(200);
  await expect(page.locator(".report-done")).toContainText("報告を受け付けました");
});

test("退会：サーバーの記録とアカウントを消し、別の端末でも記録が消えている（T040）", async ({ browser }) => {
  const phone = await openAs(browser, "erin");
  await expect(phone.locator(".sync-status")).toContainText("同期済み");
  await answer(phone, 3);
  await myPage(phone).click();
  await phone.getByRole("tab", { name: "設定" }).click(); // マイページは「記録」「設定」に分けた（T065）
  await hideAndShow(phone); // 未送信を送る
  await expect(phone.locator(".sync-status")).toContainText("同期済み");

  await phone.getByRole("button", { name: "記録を全部消す（退会）" }).click();
  await expect(phone.locator(".delete-confirm")).toContainText("回答 3 件");
  phone.once("dialog", (d) => d.accept());
  await phone.locator(".delete-confirm").getByRole("button", { name: "消す" }).click();
  await expect(phone.locator(".delete-data")).toContainText("記録を全部消しました");
  await expect(phone.getByRole("button", { name: "Google でログイン" })).toBeVisible(); // ログアウトの状態

  const pc = await openAs(browser, "erin");
  await expect(pc.locator(".sync-status")).toContainText("同期済み");
  await expect(allYears(pc)).toContainText("回答済み 0枚");
});
