import { expect, test } from "@playwright/test";
import { openHome } from "./helpers";

// 聞き流し（T057）。端末の読み上げは作り物に差し替える（読んだ文を記録し、少し待って読み終わる）

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__spoken = [];
    class U {
      text: string;
      lang = "";
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(t: string) {
        this.text = t;
      }
    }
    let current: U | null = null;
    let timer: number | undefined;
    const synth = {
      speak(u: U) {
        if (u.text) w.__spoken.push(u.text);
        current = u;
        timer = window.setTimeout(() => {
          if (current !== u) return;
          current = null;
          u.onend?.();
        }, u.text ? 200 : 0);
      },
      cancel() {
        window.clearTimeout(timer);
        const c = current;
        current = null;
        c?.onerror?.();
      },
      getVoices: () => [{ lang: "ja-JP", name: "テスト" }],
      addEventListener() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: U, configurable: true });
    if (!localStorage.getItem("tanto.listen.v1")) localStorage.setItem("tanto.listen.v1", JSON.stringify({ rate: 1, pause: 3 }));
  });
});

const logLength = (page: any) => page.evaluate(() => JSON.parse(localStorage.getItem("tanto.log.v1") ?? "[]").length);

test("肢を読み、○×を押したらその答えだけ記録して答えを読む。押さなければ記録せずに次へ進む", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: /聞き流す/ }).click();
  await page.getByRole("button", { name: "▶ 聞きはじめる" }).click();
  await expect(page.locator(".listen-phase")).toContainText(/読み上げ中|考える時間/);
  const first = await page.locator(".listen-card .statement").innerText();
  expect(await page.evaluate(() => (window as any).__spoken[0])).toContain(first.slice(0, 10));

  // 1肢目は○を押す → 記録して、待たずに答えを読む
  await page.locator(".listen-actions").getByRole("button", { name: "○", exact: true }).click();
  await expect(page.locator(".listen-phase")).toContainText("正解は");
  expect(await logLength(page)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__spoken.some((t: string) => t.includes("正解は、")))).toBe(true);

  // 2肢目は押さない → 考える時間のあと答えを読み、3肢目へ。記録は増えない
  await expect(page.locator(".toolbar")).toContainText("2肢目", { timeout: 5000 });
  await expect(page.locator(".listen-phase")).toContainText("考える時間", { timeout: 5000 });
  await expect(page.locator(".toolbar")).toContainText("3肢目", { timeout: 8000 });
  expect(await logLength(page)).toBe(1);

  await page.getByRole("button", { name: "止める" }).click();
  await expect(page.locator(".listen-summary")).toContainText("聞いた 2 肢・答えた 1 肢");
});

test("一時停止と再開、次の肢へ", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: /聞き流す/ }).click();
  await page.getByRole("button", { name: "▶ 聞きはじめる" }).click();
  await page.getByRole("button", { name: "❚❚ 一時停止" }).click();
  await expect(page.locator(".listen-phase")).toHaveText("一時停止中");
  await page.getByRole("button", { name: "▶ 再開" }).click();
  await expect(page.locator(".listen-phase")).toContainText(/読み上げ中|考える時間/);
  await page.getByRole("button", { name: "次の肢へ ▶▶" }).click();
  await expect(page.locator(".toolbar")).toContainText("2肢目");
});
