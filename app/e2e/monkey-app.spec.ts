import { expect, test } from "@playwright/test";
import { openHome } from "./helpers";

// アプリ全体のいたずら押し（発見的なバグ探し）。見えているボタン・リンクをでたらめに押し、
// 例外・console.error・真っ白な画面が出ないかを見る。外へ出るリンク・ログイン・データの削除は押さない
function rng(seed: number) {
  let x = seed * 2654435761 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

const SKIP = /ログイン|ログアウト|削除|消す|リセット|Google|報告|X で|共有|ダウンロード|書き出|読み込む|止める/;

for (let seed = 1; seed <= 8; seed++) {
  test(`アプリ全体のいたずら押し seed=${seed}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource|404|net::ERR/.test(m.text())) errors.push(`console: ${m.text()}`);
    });
    page.on("dialog", (d) => void d.dismiss());
    await page.route("**/audio/**", (r) => r.fulfill({ status: 404 }));
    await page.route("**/special/**", (r) => r.fulfill({ status: 404 }));
    await openHome(page);
    const r = rng(seed);
    const log: string[] = [];
    for (let k = 0; k < 120; k++) {
      // アプリの外へ出たら（戻りすぎ・別のサイト）、ホームから続ける
      if (!page.url().startsWith("http://localhost")) {
        await openHome(page);
        log.push("（ホームから）");
      }
      const cands = await page.evaluate((skip) => {
        const re = new RegExp(skip);
        const els = [...document.querySelectorAll<HTMLElement>("button, a[href], summary, [role=button], input[type=checkbox], select")];
        return els
          .map((el, i) => ({ el, i }))
          .filter(({ el }) => {
            const r = el.getBoundingClientRect();
            const t = (el.textContent ?? "") + (el.getAttribute("aria-label") ?? "");
            const href = el.getAttribute("href") ?? "";
            return r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled && !re.test(t) && !/^https?:|^mailto:/.test(href) && el.getAttribute("target") !== "_blank";
          })
          .map(({ el, i }) => {
            el.dataset.monkey = String(i);
            return { i, t: ((el.textContent ?? "").trim() || el.getAttribute("aria-label") || el.tagName).slice(0, 20) };
          });
      }, SKIP.source);
      if (!cands.length) break;
      // ときどき戻る・スクロールする
      const p = r();
      if (p < 0.06) {
        await page.goBack().catch(() => {});
        log.push("← 戻る");
      } else {
        const c = cands[Math.floor(r() * cands.length)];
        await page.locator(`[data-monkey="${c.i}"]`).first().click({ timeout: 800, force: true }).catch(() => {});
        log.push(c.t);
      }
      await page.waitForTimeout(Math.floor(r() * 200));
      const main = await page.locator("main").innerText({ timeout: 2000 }).catch(() => "");
      if (!main.trim() && page.url().startsWith("http://localhost")) errors.push(`真っ白：${page.url()}`);
      if (errors.length) break;
    }
    expect(errors, `押した順：${log.join(" → ")}`).toEqual([]);
    console.log(`seed=${seed}：${log.length} 回押した。最後の画面 ${page.url()}`);
  });
}
