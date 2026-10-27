import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openHome, openYear } from "./helpers";

// 肢で解くの読み上げ（T062）。<audio> の再生は作り物にして、何を流したかを記録する
test.beforeEach(async ({ page }) => {
  // 作っておいた音声の代わりに、同梱の無音を返す（<audio> が実際に読み込むので、空だと error になる）
  const silence = readFileSync(new URL("../public/sounds/silence-1.mp3", import.meta.url));
  await page.route("**/audio/tts/**", (route) => route.fulfill({ status: 200, contentType: "audio/mpeg", body: silence }));
  await page.addInitScript(() => {
    const w = window as any;
    w.__played = [];
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      w.__played.push(this.src.replace(location.origin, ""));
      window.setTimeout(() => this.dispatchEvent(new Event("ended")), 300);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  });
});

const played = (page: import("@playwright/test").Page) => page.evaluate(() => (window as any).__played as string[]);

test("肢の🔊で声1の肢の音声、答えたあとの🔊で答えと解説の結論の音声を流す", async ({ page }) => {
  await openHome(page);
  await openYear(page, "刑法", "R08", "肢で解く");
  await page.getByRole("button", { name: "肢を読み上げる" }).click();
  await expect.poll(() => played(page)).toHaveLength(1);
  expect((await played(page))[0]).toMatch(/^\/audio\/tts\/gemini-leda\/.+\.q\.mp3$/);

  await page.getByRole("button", { name: "○", exact: true }).click();
  await page.getByRole("button", { name: "答えと解説の結論を読み上げる" }).click();
  await expect.poll(() => played(page)).toHaveLength(2);
  expect((await played(page))[1]).toBe((await played(page))[0].replace(".q.mp3", ".a.mp3"));
});

test("流している間はもう一度押すと止まる（ボタンが■になり、押すと🔊に戻る）", async ({ page }) => {
  await openHome(page);
  await openYear(page, "刑法", "R08", "肢で解く");
  const b = page.locator(".speak-row .speak-button");
  await b.click();
  await expect(b).toHaveText("■");
  await b.click();
  await expect(b).toHaveText("🔊");
});
