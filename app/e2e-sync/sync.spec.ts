import { expect, test, type Browser, type Page } from "@playwright/test";

const allYears = (page: Page) =>
  page.locator(".subject").filter({ has: page.locator("h2", { hasText: "民法" }) }).locator(".set").filter({ hasText: "全年度から" });

/** テスト用ログインの利用者 ID を入れた状態で開く（本番のビルドには入らない仕組み） */
async function openAs(browser: Browser, user: string | null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  if (user) await ctx.addInitScript((u) => localStorage.setItem("tanto.testUser", u), user);
  const page = await ctx.newPage();
  await page.goto("/");
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
  await expect(phone.locator(".authbar")).toContainText("テスト利用者 alice");
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

test("ログイン前に解いた記録は、ログインするとアカウントに引き継がれ、ログアウトで端末から消える", async ({ browser }) => {
  const page = await openAs(browser, null);
  await answer(page, 2);
  await expect(allYears(page)).toContainText("回答済み 2枚");
  page.once("dialog", (d) => d.accept("carol")); // テスト用ログインの利用者 ID
  await page.getByRole("button", { name: "Google でログイン" }).click();
  await expect(page.locator(".sync-status")).toContainText("同期済み");

  const second = await openAs(browser, "carol");
  await expect(allYears(second)).toContainText("回答済み 2枚");

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("button", { name: "Google でログイン" })).toBeVisible();
  await expect(allYears(page)).toContainText("回答済み 0枚");
});
