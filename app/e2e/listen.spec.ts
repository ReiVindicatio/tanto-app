import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openHome } from "./helpers";

// 聞き流し（T057・T058）。再生（<audio>）と端末の読み上げは作り物に差し替え、何をどの順に流したかを記録する

// audioMissing：all＝作っておいた音声がひとつもない、voice1＝声1（アニメ風）だけない、none＝全部ある
async function stub(page: Page, opts: { audioMissing: "all" | "voice1" | "none" }) {
  // 作っておいた音声の代わりに、同梱の無音を返す（<audio> が実際に読み込むので、ないと error になる）
  const silence = readFileSync(new URL("../public/sounds/silence-1.mp3", import.meta.url));
  const missing = (url: string) => opts.audioMissing === "all" || (opts.audioMissing === "voice1" && url.includes("/gemini-leda/"));
  await page.route("**/audio/tts/**", (route) =>
    missing(route.request().url()) ? route.fulfill({ status: 404 }) : route.fulfill({ status: 200, contentType: "audio/mpeg", body: silence }),
  );
  await page.addInitScript((audioMissing) => {
    const w = window as any;
    w.__played = [];
    w.__spoken = [];
    // <audio>：src を記録し、少し待って ended を出す（考える間の無音は長めにして、画面の段階を確かめられるように）
    const timers = new WeakMap<HTMLMediaElement, number>();
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const src = this.src;
      w.__played.push(src.replace(location.origin, ""));
      window.clearTimeout(timers.get(this));
      const missing = src.includes("/audio/tts/") && (audioMissing === "all" || (audioMissing === "voice1" && src.includes("/gemini-leda/")));
      const wait = src.includes("silence-3") ? 700 : 120;
      timers.set(this, window.setTimeout(() => this.dispatchEvent(new Event(missing ? "error" : "ended")), missing ? 10 : wait));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      window.clearTimeout(timers.get(this));
    };
    // 端末の読み上げ（音声がない肢のとき）
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
  }, opts.audioMissing);
}

const logLength = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("tanto.log.v1") ?? "[]").length);
const played = (page: Page) => page.evaluate(() => (window as any).__played as string[]);
const spoken = (page: Page) => page.evaluate(() => (window as any).__spoken as string[]);

async function start(page: Page) {
  await openHome(page);
  await page.getByRole("button", { name: /聞き流す/ }).click();
  await page.getByRole("button", { name: "▶ 聞きはじめる" }).click();
}

test("作っておいた音声（既定は声1）で、肢 → 考える間（無音）→ 答えの順に流す。○を押したら「正解／不正解」と答えに進み、その答えだけ記録する", async ({ page }) => {
  await stub(page, { audioMissing: "none" });
  await start(page);
  await expect(page.locator(".listen-phase")).toContainText(/読み上げ中|考える時間/);
  await page.locator(".listen-actions").getByRole("button", { name: "○", exact: true }).click();
  await expect(page.locator(".listen-phase")).toContainText("正解は");
  expect(await logLength(page)).toBe(1);
  // 2肢目は押さない：考える間の無音が流れてから答えへ
  await expect(page.locator(".toolbar")).toContainText("2肢目", { timeout: 5000 });
  await expect(page.locator(".listen-phase")).toContainText("考える時間", { timeout: 5000 });
  await expect(page.locator(".toolbar")).toContainText("3肢目", { timeout: 8000 });
  expect(await logLength(page)).toBe(1);

  const p = (await played(page)).filter((x) => !x.endsWith("silence-1.mp3"));
  // 1肢目：q → （○を押した）正解／不正解 → a。2肢目：q → 無音3秒 → a
  expect(p[0]).toMatch(/^\/audio\/tts\/gemini-leda\/.+\.q\.mp3$/);
  expect(p[1]).toMatch(/^\/sounds\/gemini-leda\/(seikai|fuseikai)\.mp3$/);
  expect(p[2]).toBe(p[0].replace(".q.mp3", ".a.mp3"));
  expect(p[3]).toMatch(/\.q\.mp3$/);
  expect(p[4]).toBe("/sounds/silence-3.mp3");
  expect(p[5]).toBe(p[3].replace(".q.mp3", ".a.mp3"));
  expect(await spoken(page)).toEqual([]); // 端末の読み上げは使っていない

  await page.getByRole("button", { name: "止める" }).click();
  await expect(page.locator(".listen-summary")).toContainText("聞いた 2 肢・答えた 1 肢");
});

test("声1がない肢は声2で流す。声2を選ぶと声2だけを流す", async ({ page }) => {
  await stub(page, { audioMissing: "voice1" });
  await openHome(page);
  await page.getByRole("button", { name: /聞き流す/ }).click();
  await expect(page.getByRole("button", { name: "声1" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "▶ 聞きはじめる" }).click();
  await expect.poll(async () => (await played(page)).some((x) => x.includes("/ja-JP-Chirp3-HD-Achernar/"))).toBe(true);
  const p = (await played(page)).filter((x) => x.includes("/audio/tts/"));
  expect(p[0]).toMatch(/\/gemini-leda\/.+\.q\.mp3$/);
  expect(p[1]).toBe(p[0].replace("/gemini-leda/", "/ja-JP-Chirp3-HD-Achernar/"));
  expect(await spoken(page)).toEqual([]);

  await page.getByRole("button", { name: "止める" }).click();
  await page.getByRole("button", { name: "戻る" }).click();
  await page.getByRole("button", { name: /聞き流す/ }).click();
  await page.getByRole("button", { name: "声2" }).click();
  await page.evaluate(() => ((window as any).__played = []));
  await page.getByRole("button", { name: "▶ 聞きはじめる" }).click();
  await expect.poll(async () => (await played(page)).filter((x) => x.includes("/audio/tts/")).length).toBeGreaterThan(0);
  expect((await played(page)).filter((x) => x.includes("/audio/tts/")).every((x) => x.includes("/ja-JP-Chirp3-HD-Achernar/"))).toBe(true);
});

test("音声がない肢は、端末の読み上げで肢と答えを読む", async ({ page }) => {
  await stub(page, { audioMissing: "all" });
  await start(page);
  const first = await page.locator(".listen-card .statement").innerText();
  await expect.poll(async () => (await spoken(page))[0] ?? "").toContain(first.slice(0, 10));
  await expect.poll(async () => (await spoken(page)).some((t) => t.includes("正解は、")), { timeout: 8000 }).toBe(true);
});

test("一時停止と再開、次の肢へ", async ({ page }) => {
  await stub(page, { audioMissing: "none" });
  await start(page);
  await page.getByRole("button", { name: "❚❚ 一時停止" }).click();
  await expect(page.locator(".listen-phase")).toHaveText("一時停止中");
  await page.getByRole("button", { name: "▶ 再開" }).click();
  await expect(page.locator(".listen-phase")).toContainText(/読み上げ中|考える時間/);
  await page.getByRole("button", { name: "次の肢へ ▶▶" }).click();
  await expect(page.locator(".toolbar")).toContainText("2肢目");
});
