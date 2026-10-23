import { expect, test, type Page } from "@playwright/test";
import { openHome, openYear } from "./helpers";

// 肢カードをはじく・キーボードで答える（T051）

async function truthOf(request: any) {
  const data = await (await request.get("/data/yobi-2026-minpo.json")).json();
  return new Map<string, boolean>(
    data.statements.filter((s: any) => s.truth_at_exam && !s.review_flag).map((s: any) => [s.text, s.truth_at_exam.value]),
  );
}

/** 指でカードを横に動かして離す（pointer のイベントを直接送る） */
async function drag(page: Page, dx: number) {
  const card = page.locator(".swipe-card");
  const box = (await card.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 40;
  const base = { pointerType: "touch", isPrimary: true, pointerId: 7, bubbles: true };
  await card.dispatchEvent("pointerdown", { ...base, clientX: x, clientY: y });
  for (const k of [0.25, 0.5, 0.75, 1]) {
    await card.dispatchEvent("pointermove", { ...base, clientX: x + dx * k, clientY: y });
  }
  await card.dispatchEvent("pointerup", { ...base, clientX: x + dx, clientY: y });
}

test.describe("スマホ", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("右にはじくと○・左にはじくと×で答え、答えの後にはじくと次の肢へ", async ({ page, request }) => {
    const truth = await truthOf(request);
    await openHome(page);
    await openYear(page, "民法", "R08", "肢で解く");
    await expect(page.locator(".swipe-hint .hint-touch")).toBeVisible();

    for (let k = 0; k < 3; k++) {
      const text = await page.locator(".statement").innerText();
      await drag(page, truth.get(text) ? 160 : -160);
      await expect(page.locator(".result.ok")).toBeVisible();
      await drag(page, -160);
      await expect(page.locator(".statement")).not.toHaveText(text);
    }
    // 3問続けて正解したので、4問目を正解すると「4連続正解」
    const text = await page.locator(".statement").innerText();
    await drag(page, truth.get(text) ? 160 : -160);
    await expect(page.locator(".combo")).toHaveText("4連続正解");
  });

  test("少しだけ動かして離したら答えにならない", async ({ page }) => {
    await openHome(page);
    await openYear(page, "民法", "R08", "肢で解く");
    await drag(page, 30);
    await expect(page.locator(".result")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "○", exact: true })).toBeVisible();
  });
});

test("PC：キーボードだけで答えて次へ進み、まちがえたら連続正解が消える", async ({ page, request }) => {
  const truth = await truthOf(request);
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  await expect(page.locator(".swipe-hint .hint-keys")).toBeVisible();

  for (let k = 0; k < 3; k++) {
    const text = await page.locator(".statement").innerText();
    await page.keyboard.press(truth.get(text) ? "ArrowRight" : "ArrowLeft");
    await expect(page.locator(".result.ok")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".statement")).not.toHaveText(text);
  }
  let text = await page.locator(".statement").innerText();
  await page.keyboard.press(truth.get(text) ? "o" : "x");
  await expect(page.locator(".combo")).toHaveText("4連続正解");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".statement")).not.toHaveText(text);

  text = await page.locator(".statement").innerText();
  await page.keyboard.press(truth.get(text) ? "x" : "o");
  await expect(page.locator(".result.ng")).toBeVisible();
  await expect(page.locator(".combo")).toHaveCount(0);
});
