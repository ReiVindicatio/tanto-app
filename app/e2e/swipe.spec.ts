import { expect, test, type Page } from "@playwright/test";
import { openHome, openYear } from "./helpers";

// 肢カードをはじく・キーボードで答える（T051）
// 飛んでいくカードの複製（body の直下）と紛れないよう、画面の本体（.page）の中だけを見る

async function truthOf(request: any) {
  const data = await (await request.get("/data/yobi-2026-minpo.json")).json();
  return new Map<string, boolean>(
    data.statements.filter((s: any) => s.truth_at_exam && !s.review_flag).map((s: any) => [s.text, s.truth_at_exam.value]),
  );
}

/** 指でカードを動かして離す（Chromium の CDP で本物のタッチを送る。ブラウザのスクロールも本物どおりに動く） */
async function drag(page: Page, dx: number, dy = 0) {
  const box = (await page.locator(".page .swipe-card .statement").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, px: number, py: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: px, y: py }] });
  await send("touchStart", x, y);
  for (const k of [0.1, 0.25, 0.5, 0.75, 1]) await send("touchMove", x + dx * k, y + dy * k);
  await send("touchEnd", x + dx, y + dy);
  await cdp.detach();
}

test.describe("スマホ", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("右にはじくと○・左にはじくと×で答え、答えの後にはじくと次の肢へ", async ({ page, request }) => {
    const truth = await truthOf(request);
    await openHome(page);
    await openYear(page, "民法", "R08", "肢で解く");
    await expect(page.locator(".page .swipe-hint .hint-touch")).toBeVisible();

    for (let k = 0; k < 3; k++) {
      const text = await page.locator(".page .statement").innerText();
      await drag(page, truth.get(text) ? 160 : -160);
      await expect(page.locator(".page .result.ok")).toBeVisible();
      await drag(page, -160);
      await expect(page.locator(".page .statement")).not.toHaveText(text);
    }
    // 3問続けて正解したので、4問目を正解すると「4連続正解」
    const text = await page.locator(".page .statement").innerText();
    await drag(page, truth.get(text) ? 160 : -160);
    await expect(page.locator(".page .combo")).toHaveText("4連続正解");
  });

  test("少し斜めにはじいても答えになり、その間ページは縦にスクロールしない", async ({ page }) => {
    await openHome(page);
    await openYear(page, "民法", "R08", "肢で解く");
    // 一番上から、指を上へ斜めに動かす（スクロールを止めなければ下へスクロールするページ。縦のテストで確かめた）
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await drag(page, 160, -60);
    await expect(page.locator(".page .result")).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("縦に動かしたら答えにならない（スクロール）", async ({ page }) => {
    await openHome(page);
    await openYear(page, "民法", "R08", "肢で解く");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await drag(page, 20, -200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0); // ページはスクロールする
    await expect(page.locator(".page .result")).toHaveCount(0);
  });

  test("少しだけ動かして離したら答えにならない", async ({ page }) => {
    await openHome(page);
    await openYear(page, "民法", "R08", "肢で解く");
    await drag(page, 30);
    await expect(page.locator(".page .result")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "○", exact: true })).toBeVisible();
  });
});

test("PC：キーボードだけで答えて次へ進み、まちがえたら連続正解が消える", async ({ page, request }) => {
  const truth = await truthOf(request);
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  await expect(page.locator(".page .swipe-hint .hint-keys")).toBeVisible();

  for (let k = 0; k < 3; k++) {
    const text = await page.locator(".page .statement").innerText();
    await page.keyboard.press(truth.get(text) ? "ArrowRight" : "ArrowLeft");
    await expect(page.locator(".page .result.ok")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".page .statement")).not.toHaveText(text);
  }
  let text = await page.locator(".page .statement").innerText();
  await page.keyboard.press(truth.get(text) ? "o" : "x");
  await expect(page.locator(".page .combo")).toHaveText("4連続正解");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".page .statement")).not.toHaveText(text);

  text = await page.locator(".page .statement").innerText();
  await page.keyboard.press(truth.get(text) ? "x" : "o");
  await expect(page.locator(".page .result.ng")).toBeVisible();
  await expect(page.locator(".page .combo")).toHaveCount(0);
});
