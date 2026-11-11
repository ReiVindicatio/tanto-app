import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openHome } from "./helpers";

// 聞き流しの「いたずら押し」（発見的なバグ探し）。<audio> を本物に近い作り物に差し替え、○×・一時停止／再開・次の肢へを
// でたらめな順と間隔で押す。そのあと、止まっていない（流れが進む）こと・流れが2本同時に走っていないことを確かめる。
// 作り物の <audio> は、本物と同じく：play() は読み込みが終わってから解決し、その前に pause()・src の差し替えがあると AbortError で断る。
// 終わった音声をもう一度 play() すると頭から流す。pause() は途中の位置を覚え、play() でそこから続ける

async function realisticAudio(page: Page, opts: { missing?: boolean; wakeLockMs?: number } = {}) {
  const silence = readFileSync(new URL("../public/sounds/silence-1.mp3", import.meta.url));
  await page.route("**/audio/tts/**", (route) =>
    opts.missing ? route.fulfill({ status: 404 }) : route.fulfill({ status: 200, contentType: "audio/mpeg", body: silence }),
  );
  if (opts.wakeLockMs !== undefined) {
    // 画面を消さない仕組み（Wake Lock）が返るまでの時間。スマホでは少しかかる
    await page.addInitScript((ms) => {
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: { request: () => new Promise((r) => setTimeout(() => r({ release: async () => {} }), ms)) },
      });
    }, opts.wakeLockMs);
  }
  await page.addInitScript((missing) => {
    const w = window as any;
    w.__played = [];
    w.__violations = [];
    w.__clicks = [];
    // 押した瞬間のボタンの文字（再開と一時停止は同じボタンの表示が変わるので、押す側の思い込みではなく実際を記録する）
    document.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest?.("button");
      if (b) w.__clicks.push(`${b.textContent?.trim()}@${Math.round(performance.now())}`);
    }, true);
    type St = { src: string; paused: boolean; ended: boolean; pos: number; dur: number; startedAt: number; timer?: number; loadTimer?: number; reject?: (e: unknown) => void; endedListeners: number };
    const st = new WeakMap<HTMLMediaElement, St>();
    const S = (el: HTMLMediaElement): St => {
      let s = st.get(el);
      if (!s) st.set(el, (s = { src: "", paused: true, ended: false, pos: 0, dur: 0, startedAt: 0, endedListeners: 0 }));
      return s;
    };
    const durOf = (src: string) => {
      const m = src.match(/silence-(\d+)/);
      if (m) return Number(m[1]) * 150;
      return 250;
    };
    const abortPending = (s: St) => {
      window.clearTimeout(s.loadTimer);
      s.loadTimer = undefined;
      if (s.reject) {
        const r = s.reject;
        s.reject = undefined;
        r(new DOMException("The play() request was interrupted", "AbortError"));
      }
    };
    const proto = HTMLMediaElement.prototype;
    Object.defineProperty(proto, "src", {
      configurable: true,
      get(this: HTMLMediaElement) {
        return S(this).src;
      },
      set(this: HTMLMediaElement, v: string) {
        const s = S(this);
        abortPending(s);
        window.clearTimeout(s.timer);
        s.src = new URL(v, location.href).href;
        s.paused = true;
        s.ended = false;
        s.pos = 0;
        s.dur = durOf(v);
      },
    });
    Object.defineProperty(proto, "paused", { configurable: true, get(this: HTMLMediaElement) { return S(this).paused; } });
    Object.defineProperty(proto, "ended", { configurable: true, get(this: HTMLMediaElement) { return S(this).ended; } });
    Object.defineProperty(proto, "duration", { configurable: true, get(this: HTMLMediaElement) { return S(this).dur / 1000; } });
    Object.defineProperty(proto, "currentTime", {
      configurable: true,
      get(this: HTMLMediaElement) {
        const s = S(this);
        return (s.paused ? s.pos : s.pos + (Date.now() - s.startedAt)) / 1000;
      },
      set() {},
    });
    const origAdd = proto.addEventListener;
    const origRemove = proto.removeEventListener;
    proto.addEventListener = function (this: HTMLMediaElement, type: string, ...rest: any[]) {
      if (type === "ended") {
        const s = S(this);
        s.endedListeners++;
        if (s.endedListeners > 1) w.__violations.push(`ended を待つ流れが ${s.endedListeners} 本（${s.src.replace(location.origin, "")}）`);
      }
      return (origAdd as any).call(this, type, ...rest);
    } as any;
    proto.removeEventListener = function (this: HTMLMediaElement, type: string, ...rest: any[]) {
      if (type === "ended") S(this).endedListeners--;
      return (origRemove as any).call(this, type, ...rest);
    } as any;
    proto.play = function (this: HTMLMediaElement) {
      const el = this;
      const s = S(el);
      if (!s.src) return Promise.reject(new DOMException("no src", "NotSupportedError"));
      if (s.ended) {
        s.ended = false;
        s.pos = 0;
      }
      if (!s.paused) return Promise.resolve();
      w.__played.push(s.src.replace(location.origin, ""));
      const isMissing = missing && s.src.includes("/audio/tts/");
      abortPending(s);
      return new Promise<void>((resolve, reject) => {
        s.reject = reject;
        s.paused = false; // 本物も play() を呼んだ時点で paused は false になる
        s.loadTimer = window.setTimeout(() => {
          s.loadTimer = undefined;
          s.reject = undefined;
          if (isMissing) {
            s.paused = true;
            el.dispatchEvent(new Event("error"));
            reject(new DOMException("not found", "NotSupportedError"));
            return;
          }
          s.startedAt = Date.now();
          el.dispatchEvent(new Event("playing"));
          resolve();
          s.timer = window.setTimeout(() => {
            s.paused = true;
            s.ended = true;
            s.pos = s.dur;
            el.dispatchEvent(new Event("pause")); // 本物も、読み終わりは pause → ended の順に出す
            el.dispatchEvent(new Event("ended"));
          }, Math.max(0, s.dur - s.pos));
        }, 20 + Math.random() * 120);
      });
    };
    proto.pause = function (this: HTMLMediaElement) {
      const s = S(this);
      if (s.paused) return;
      abortPending(s);
      window.clearTimeout(s.timer);
      if (s.startedAt) s.pos = Math.min(s.dur, s.pos + (Date.now() - s.startedAt));
      s.startedAt = 0;
      s.paused = true;
      this.dispatchEvent(new Event("pause"));
    };
    // 端末の読み上げ（音声がない肢のとき）
    class U {
      text: string;
      lang = "";
      rate = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(t: string) {
        this.text = t;
      }
    }
    const queue: U[] = [];
    let timer: number | undefined;
    const next = () => {
      const u = queue[0];
      if (!u) return;
      synth.speaking = true;
      timer = window.setTimeout(() => {
        queue.shift();
        synth.speaking = queue.length > 0;
        u.onend?.();
        next();
      }, u.text ? 300 : 0);
    };
    const synth = {
      speaking: false,
      speak(u: U) {
        if (u.text) w.__played.push(`tts:${u.text.slice(0, 8)}`);
        queue.push(u);
        if (queue.length === 1) next();
      },
      cancel() {
        window.clearTimeout(timer);
        const all = queue.splice(0);
        synth.speaking = false;
        all.forEach((u) => u.onerror?.());
      },
      getVoices: () => [{ lang: "ja-JP", name: "テスト" }],
      addEventListener() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: U, configurable: true });
    localStorage.setItem("tanto.listen.v2", JSON.stringify({ rate: 1, pause: 3, voice: 1 }));
  }, !!opts.missing);
}

/** 決まった種から並ぶ乱数（落ちたときに同じ押し方で再現できるように） */
function rng(seed: number) {
  let x = seed * 2654435761 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

const phaseText = (page: Page) => page.locator(".listen-dock .ritsu-bubble, .listen-phase").first().innerText().catch(() => "");
const playedCount = (page: Page) => page.evaluate(() => (window as any).__played.length as number);

async function monkey(page: Page, seed: number, steps: number) {
  const r = rng(seed);
  const log: string[] = [];
  for (let k = 0; k < steps; k++) {
    const pick = r();
    const delay = Math.floor(r() * (r() < 0.3 ? 30 : 450));
    let name: string;
    if (pick < 0.22) name = "○";
    else if (pick < 0.4) name = "×";
    else if (pick < 0.75) name = (await page.getByRole("button", { name: "▶ 再開" }).count()) ? "▶ 再開" : "❚❚ 一時停止";
    else name = "次の肢へ ▶▶";
    const btn = name === "○" || name === "×" ? page.locator(".listen-actions").getByRole("button", { name, exact: true }) : page.getByRole("button", { name });
    if ((await btn.count()) && (await btn.isEnabled({ timeout: 300 }).catch(() => false))) {
      await btn.click({ timeout: 1000 }).catch(() => {});
      log.push(`${name}(+${delay}ms)`);
    }
    await page.waitForTimeout(delay);
  }
  return log;
}

for (const [missing, wakeLockMs] of [[false, undefined], [true, undefined], [false, 250]] as const) {
  for (let seed = 1; seed <= 4; seed++) {
    test(`いたずら押し seed=${seed}${missing ? "（音声なし・端末の読み上げ）" : ""}${wakeLockMs ? `（Wake Lock ${wakeLockMs}ms）` : ""}`, async ({ page }) => {
      await realisticAudio(page, { missing, wakeLockMs });
      await openHome(page);
      await page.getByRole("button", { name: /聞き流す/ }).click();
      await page.getByRole("button", { name: "▶ 聞きはじめる" }).click();
      const log = await monkey(page, seed, 40);
      // 一時停止中なら再開する（押す瞬間に表示が変わることがあるので、確かめながら）
      for (let k = 0; k < 5 && (await page.getByRole("button", { name: "▶ 再開" }).count()); k++) {
        await page.getByRole("button", { name: "▶ 再開" }).click({ timeout: 500 }).catch(() => {});
        await page.waitForTimeout(300);
      }
      log.splice(0, log.length, ...(await page.evaluate(() => (window as any).__clicks as string[])).filter((c) => !c.startsWith("▶ 聞きはじめる")));
      const before = await playedCount(page);
      const where = await page.locator(".toolbar").innerText();
      // 何も押さずに待てば、流れが進む（新しい音声が流れ、肢が先へ進む）
      await expect
        .poll(async () => ({ played: (await playedCount(page)) > before + 2, moved: (await page.locator(".toolbar").innerText()) !== where }), {
          timeout: 8000,
          message: `止まった：${where}／${await phaseText(page)}\n押した順：${log.join(" ")}`,
        })
        .toEqual({ played: true, moved: true });
      const v = await page.evaluate(() => (window as any).__violations as string[]);
      expect(v, `押した順：${log.join(" ")}`).toEqual([]);
    });
  }
}

test("一時停止中に「次の肢へ」を押すと、Wake Lock の返事を待たずにすぐ読みはじめる（すぐ押し直しても流れは1本）", async ({ page }) => {
  await realisticAudio(page, { wakeLockMs: 1500 });
  await openHome(page);
  await page.getByRole("button", { name: /聞き流す/ }).click();
  await page.getByRole("button", { name: "▶ 聞きはじめる" }).click();
  await expect(page.locator(".toolbar")).toContainText("1肢目");
  await page.getByRole("button", { name: "❚❚ 一時停止" }).click();
  await page.getByRole("button", { name: "次の肢へ ▶▶" }).click();
  await expect(page.locator(".toolbar")).toContainText("2肢目", { timeout: 500 });
  await expect(page.getByRole("button", { name: "❚❚ 一時停止" })).toBeVisible({ timeout: 500 });
  await page.getByRole("button", { name: "次の肢へ ▶▶" }).click();
  await page.getByRole("button", { name: "次の肢へ ▶▶" }).click();
  await expect(page.locator(".toolbar")).toContainText("4肢目", { timeout: 500 });
  await expect(page.locator(".toolbar")).toContainText("5肢目", { timeout: 8000 });
  expect(await page.evaluate(() => (window as any).__violations)).toEqual([]);
});

test("外から音声を止められたら（電話・通知・ほかのアプリの音）一時停止にし、再開で続ける", async ({ page }) => {
  await realisticAudio(page);
  await page.addInitScript(() => {
    const A = window.Audio;
    (window as any).Audio = function (...args: unknown[]) {
      const a = new A(...(args as []));
      (window as any).__audio = a;
      return a;
    };
  });
  await openHome(page);
  await page.getByRole("button", { name: /聞き流す/ }).click();
  await page.getByRole("button", { name: "▶ 聞きはじめる" }).click();
  await expect(page.locator(".listen-dock .ritsu-bubble")).toContainText("考える時間", { timeout: 5000 });
  await page.evaluate(() => (window as any).__audio.pause()); // OS が止めた
  await expect(page.locator(".listen-dock .ritsu-bubble")).toContainText("一時停止中");
  await page.getByRole("button", { name: "▶ 再開" }).click();
  await expect(page.locator(".listen-dock .ritsu-bubble")).toContainText("考える時間");
  await expect(page.locator(".toolbar")).toContainText("2肢目", { timeout: 5000 });
});

test("○×を押して答えに進むとき（自分で音声を止めてすぐ次を流す）は、外から止められたと見なさない", async ({ page }) => {
  await realisticAudio(page);
  await openHome(page);
  await page.getByRole("button", { name: /聞き流す/ }).click();
  await page.getByRole("button", { name: "▶ 聞きはじめる" }).click();
  const at = async () => Number((await page.locator(".toolbar").innerText()).match(/(\d+)肢目/)?.[1] ?? 0);
  for (let k = 1; k <= 4; k++) {
    // 肢の番号は決め打ちしない（並列で重いと、作り物の短い音声で先へ進む）。答えられる間に押す
    const mark = page.locator(".listen-actions").getByRole("button", { name: k % 2 ? "○" : "×", exact: true });
    await expect(mark).toBeEnabled({ timeout: 5000 });
    await page.waitForTimeout(k * 60);
    await mark.click({ timeout: 500 }).catch(() => {});
    await expect(page.locator(".listen-dock .ritsu-bubble")).not.toContainText("一時停止中");
  }
  const now = await at();
  await expect.poll(at, { timeout: 5000 }).toBeGreaterThan(now); // 止まらず先へ進む
});
