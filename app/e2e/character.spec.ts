import { expect, test } from "@playwright/test";
import { openHome, openYear, tab } from "./helpers";

// キャラクター（T063）：肢で解くの答え合わせ（欄の縁からのぞく律と吹き出し）・ホームの案内・はじき方の初回案内と、マイページの出す・出さない

async function truthOf(request: any) {
  const data = await (await request.get("/data/yobi-2026-minpo.json")).json();
  return new Map<string, boolean>(data.statements.filter((s: any) => s.truth_at_exam && !s.review_flag).map((s: any) => [s.text, s.truth_at_exam.value]));
}

test("答え合わせ：正解で喜び・不正解で残念、2問続けて不正解ならジト目のちびキャラ。マイページで出さないにすると消える", async ({ page, request }) => {
  const truth = await truthOf(request);
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  const chibi = page.locator(".page .result .drill-char");
  // 答える前は、律が○×の欄の縁に座っている。はじき方の案内は、初めての1回だけ律の吹き出しで
  await expect(page.locator(".drill-dock .dock-ritsu")).toBeVisible();
  await expect(page.locator(".drill-dock .swipe-hint")).toBeVisible();

  let text = await page.locator(".page .statement").innerText();
  await page.keyboard.press(truth.get(text) ? "ArrowRight" : "ArrowLeft");
  await expect(chibi).toHaveAttribute("data-face", "happy");
  await expect(page.locator(".page .result .peek-bubble")).toHaveText("正解！");
  await page.keyboard.press("Enter");

  for (const expected of ["sad", "jito"]) {
    await expect(page.locator(".page .statement")).not.toHaveText(text);
    text = await page.locator(".page .statement").innerText();
    await page.keyboard.press(truth.get(text) ? "ArrowLeft" : "ArrowRight"); // わざとまちがえる
    await expect(chibi).toHaveAttribute("data-face", expected);
    await page.keyboard.press("Enter");
  }

  await page.getByRole("button", { name: "← 戻る" }).click();
  // 2回目からは、はじき方の案内は今までどおりの小さな文字
  await openYear(page, "民法", "R08", "肢で解く");
  await expect(page.locator(".page p.swipe-hint")).toBeVisible();
  await expect(page.locator(".drill-dock .ritsu-bubble")).toHaveCount(0);
  await page.getByRole("button", { name: "← 戻る" }).click();
  await tab(page, "ホーム").click();
  await expect(page.locator(".home-dock .ritsu-bubble")).not.toBeEmpty();
  await tab(page, "マイページ").click();
  await page.getByRole("tab", { name: "設定" }).click(); // マイページは「記録」「設定」に分けた（T065）
  await page.getByRole("group", { name: "キャラクター" }).getByRole("button", { name: "出さない" }).click();
  await openYear(page, "民法", "R08", "肢で解く");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".page .result")).toBeVisible();
  await expect(chibi).toHaveCount(0);
  await expect(page.locator(".page .result .big")).toHaveText(/^(不)?正解$/);
  await page.getByRole("button", { name: "← 戻る" }).click();
  await tab(page, "ホーム").click();
  await expect(page.locator(".ritsu-says, .ritsu-dock")).toHaveCount(0);
});

test("律のページ（T065）：上の帯の Lv から開き、律を押すとひとこと。セリフ帳から選んでも言う。出さない設定なら Lv はマイページへ", async ({ page }) => {
  await openHome(page);
  await page.locator(".streak-chip").click();
  await expect(page).toHaveURL(/\/ritsu$/);
  const bubble = page.locator(".ritsu-stage .ritsu-bubble");
  await page.getByRole("button", { name: "律に話しかける" }).click();
  await expect(bubble).not.toBeEmpty();
  await expect(page.locator(".ritsu-stage .vn-sprite")).toHaveAttribute("src", /\/chars\/ritsu\/default\/base-/);
  // セリフ帳：セリフのタブで、おしゃべりを開いて1つ選ぶ
  await page.getByRole("tab", { name: "セリフ" }).click();
  await page.locator(".line-book summary", { hasText: "おしゃべり" }).click();
  const first = page.locator(".line-book[open] li button").first();
  const text = (await first.innerText()).replace(/^\S+\s/, "");
  await first.click();
  await expect(bubble).toHaveText(text);
  // 表情を押すと立ち絵が変わる（立ち絵は上に残っている）
  await page.getByRole("tab", { name: "表情" }).click();
  await page.locator(".face-tile", { hasText: "ジト目" }).click();
  await expect(page.locator(".ritsu-stage .vn-sprite")).toHaveAttribute("data-face", "jito");

  await tab(page, "マイページ").click();
  await page.getByRole("tab", { name: "設定" }).click(); // マイページは「記録」「設定」に分けた（T065）
  await page.getByRole("group", { name: "キャラクター" }).getByRole("button", { name: "出さない" }).click();
  await page.locator(".streak-chip").click();
  await expect(page).toHaveURL(/\/me$/);
});

test("お披露目（T065）：Lv.5 で衣装が開くと、ホームに案内（開く順でニットから）。幕が開いてセリフを最後まで聞くと着てもらえ、アルバムに並ぶ", async ({ page }) => {
  // 初めての肢を75問正解（経験値150）＝ Lv.5
  await page.addInitScript(() => {
    if (localStorage.getItem("tanto.log.v1")) return;
    const now = new Date().toISOString();
    const log = Array.from({ length: 75 }, (_, i) => ({ id: `r${i}`, s: `yobi-2026-minpo-q${String(i + 1).padStart(3, "0")}-a`, ok: true, at: now }));
    localStorage.setItem("tanto.log.v1", JSON.stringify(log));
  });
  await openHome(page);
  await expect(page.locator(".streak-chip")).toContainText("Lv.5");
  await page.locator(".reveal-invite").click();
  await expect(page).toHaveURL(/\/ritsu\/reveal\/knit$/);
  await expect(page.locator(".reveal-title")).toHaveText("ひだまりニット");
  const bubble = page.locator(".reveal-bubble");
  await expect(bubble).toHaveText("じゃーん……ど、どうかな", { timeout: 5000 });
  for (let k = 0; k < 4; k++) await page.getByRole("button", { name: "次のセリフ" }).click();
  await expect(bubble).toHaveText("ココア、いれたよ。一緒に飲も");
  await page.getByRole("button", { name: "着てもらう" }).click();
  await expect(page).toHaveURL(/\/ritsu$/);
  await expect(page.locator(".ritsu-stage .vn-sprite")).toHaveAttribute("src", /\/chars\/ritsu\/knit\/base-/);
  await page.getByRole("tab", { name: "アルバム" }).click();
  await expect(page.locator(".album-tile")).toHaveCount(1);
  // 一度見たら、案内は出ない（次の衣装は Lv.10）
  await tab(page, "ホーム").click();
  await expect(page.locator(".reveal-invite")).toHaveCount(0);
});

test("背景は衣装で決まり、選ぶタブはない", async ({ page }) => {
  await openHome(page);
  await page.locator(".streak-chip").click();
  await expect(page.locator(".ritsu-stage")).toHaveAttribute("style", /chars\/bg\/room\.webp/);
  await expect(page.getByRole("tab", { name: "背景" })).toHaveCount(0);
});

test("○×を押すと、答え合わせが見える位置まで送る。もう見えていれば動かさない（T066）", async ({ page, request }) => {
  const truth = await truthOf(request);
  await openHome(page);
  await openYear(page, "民法", "R08", "肢で解く");
  // 高い画面：答え合わせがもう見えているので、動かさない
  await page.setViewportSize({ width: 390, height: 1400 });
  let text = await page.locator(".page .statement").innerText();
  await page.keyboard.press(truth.get(text) ? "ArrowRight" : "ArrowLeft");
  await expect(page.locator(".page .result")).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.keyboard.press("Enter");
  // 低い画面：肢の文の下に隠れるので、見える位置まで送る
  await page.setViewportSize({ width: 390, height: 460 });
  await expect(page.locator(".page .statement")).not.toHaveText(text);
  text = await page.locator(".page .statement").innerText();
  await page.keyboard.press(truth.get(text) ? "ArrowRight" : "ArrowLeft");
  await expect(page.locator(".page .result")).toBeInViewport();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("衣装の開き方（T068）：未開放はレベルや模試の条件を出す。模試を提出すると節目の衣装が開く。管理者は全部開く", async ({ page }) => {
  await openHome(page);
  await page.locator(".streak-chip").click();
  const tile = (name: string) => page.locator(".theme-tile").filter({ hasText: name });
  await expect(tile("Lv.5 で開く")).toHaveCount(1);
  await expect(tile("模試を1回提出で開く")).toHaveCount(1);
  await page.evaluate(() => {
    localStorage.setItem("tanto.mock.v1", JSON.stringify([{ key: "yobi-a", earned: 10, full: 30, elapsedMs: 1, timedOut: false, at: new Date().toISOString() }]));
  });
  await page.reload();
  await expect(tile("模試の朝")).toHaveCount(1);
  // ログインしていないと起動時に印が消える。消える時機によって落ちたので、消えないようにしてから確かめる（2026-11-03 CI）
  await beAdmin(page);
  await page.reload();
  await expect(page.locator(".theme-tile.locked")).toHaveCount(0);
  await expect(tile("ひだまりニット")).toHaveCount(1);
  await expect(page.locator(".appbar .admin-badge")).toHaveText("管理者");
});

/** ログインせずに管理者の画面を見る（ログインしていないと起動時に印が消えるので、消えないようにする） */
async function beAdmin(page: any) {
  await page.addInitScript(() => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (k: string) {
      if (k !== "tanto.admin.v1") remove.call(this, k);
    };
    localStorage.setItem("tanto.admin.v1", "1");
  });
}

test("特別な衣装（T069）：管理者でなければ鍵の印で着られない。管理者は着られて、演出を確かめて飛ばせる", async ({ page }) => {
  await page.route("**/special/**", () => {}); // 動画の読み込み中のまま（押して飛ばせることを見る）
  await openHome(page);
  await page.evaluate(() => {
    localStorage.setItem("tanto.character.theme.v1", "hoshiyomi");
    localStorage.setItem("tanto.character.revealed.v1", JSON.stringify(["hoshiyomi"])); // 端末の値を書き換えても開かない
  });
  await page.goto("/ritsu");
  await expect(page.locator(".theme-tile").first()).toBeVisible();
  // 絵は渡さず、鍵の印と名前だけ。いつもの衣装と分かれている
  const locked = page.locator(".special-locked", { hasText: "星詠み" });
  await expect(locked).toBeDisabled();
  await expect(locked.locator(".lock-mark")).toBeVisible();
  await expect(locked.locator("img")).toHaveCount(0);
  await expect(page.locator(".theme-section", { hasText: "特別な衣装" })).toBeVisible();
  await expect(page.locator(".theme-tile.locked:not(.special-locked) .lock-mark").first()).toBeVisible();
  await expect(page.locator(".special-preview")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-costume", "hoshiyomi");

  await beAdmin(page);
  await page.goto("/ritsu");
  await expect(page.locator(".theme-tile.chosen")).toContainText("星詠み");
  await expect(page.locator("html")).toHaveAttribute("data-costume", "hoshiyomi");
  await expect(page.locator(".ritsu-stage .star-fall")).toBeAttached();

  // 絵は公開フォルダではなく /special/ から
  await expect(page.locator(".ritsu-stage .vn-sprite")).toHaveAttribute("src", /\/special\/hoshiyomi\/base-smile\.webp$/);

  // 全画面の技がある衣装は、動画ではなく技を出す
  await page.locator(".special-preview button", { hasText: "登場" }).click();
  await expect(page.locator(".signature")).toBeVisible();
  await expect(page.locator(".special-move")).toHaveCount(0);
  await page.locator(".signature").click();
  await expect(page.locator(".signature")).toHaveCount(0);

});

test("雪花の姫君：背中に結晶の輪があり、押すと固有モーション、決めで全画面の技が出る", async ({ page }) => {
  await page.route("**/special/**", () => {});
  await beAdmin(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("tanto.character.theme.v1", "yukihana");
    localStorage.setItem("tanto.character.revealed.v1", JSON.stringify(["yukihana"]));
  });
  await page.goto("/");
  await page.locator("button", { hasText: "はじめる" }).first().click();
  await expect(page.locator(".perch.ring .ice-halo")).toBeAttached();
  await expect(page.locator(".perch.ring .star-pal")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-world", "yukihana");
  await page.locator(".perch.ring .perch-inner").first().dispatchEvent("click");
  await expect(page.locator(".pages-catch")).toHaveCount(0); // 押すと全画面の技ではなく固有モーション
  await page.goto("/ritsu");
  await page.locator(".special-preview button", { hasText: "決め" }).click();
  await expect(page.locator(".pages-catch")).toBeAttached();
  await page.locator(".pages-catch").click();
  await expect(page.locator(".pages-catch")).toHaveCount(0);
});

test("舞台の歌姫：照明が画面の奥にあり、押すと幕の全画面の技が出る", async ({ page }) => {
  await page.route("**/special/**", () => {});
  await beAdmin(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("tanto.character.theme.v1", "diva");
    localStorage.setItem("tanto.character.revealed.v1", JSON.stringify(["diva"]));
  });
  await page.goto("/");
  await page.locator("button", { hasText: "はじめる" }).first().click();
  await expect(page.locator(".stage-lights")).toBeAttached();
  await page.locator(".perch.stage .perch-inner").first().dispatchEvent("click");
  await expect(page.locator(".curtain-fx")).toBeAttached();
  await page.locator(".curtain-fx").click({ force: true });
  await expect(page.locator(".curtain-fx")).toHaveCount(0);
});

test("合格の袴：小鳥が画面にいて、答えると押したボタンのところへ飛ぶ。律を押すと全画面の技が出る", async ({ page }) => {
  await page.route("**/special/**", () => {});
  await beAdmin(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("tanto.character.theme.v1", "hakama");
    localStorage.setItem("tanto.character.revealed.v1", JSON.stringify(["hakama"]));
    localStorage.removeItem("tanto.special.signature.seen.v1");
  });
  await page.goto("/");
  await page.locator("button", { hasText: "はじめる" }).first().click();
  const bird = page.locator(".screen-bird");
  await expect(bird).toBeAttached();
  const button = await page.locator("button.mark").nth(1).boundingBox();
  await page.locator("button.mark").nth(1).click();
  await expect(bird).toBeAttached(); // 答えて律の絵が替わっても、小鳥は残る
  await expect.poll(async () => {
    const box = await bird.boundingBox();
    return box && Math.abs(box.x + box.width / 2 - (button!.x + button!.width / 2));
  }, { timeout: 3000 }).toBeLessThan(4);
  await page.locator(".branch-hit").first().dispatchEvent("click");
  await expect(page.locator(".pages-catch")).toBeAttached();
  await page.locator(".pages-catch").click();
  await expect(page.locator(".pages-catch")).toHaveCount(0);
});

test("特別な衣装のお披露目：全画面の技がある衣装は、途中で動画ではなく技を出し、飛ばすと次のセリフへ進む", async ({ page }) => {
  await page.route("**/special/**", () => {});
  await beAdmin(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("tanto.character.theme.v1", "hoshiyomi");
    localStorage.setItem("tanto.character.revealed.v1", JSON.stringify(["hoshiyomi"]));
  });
  await page.goto("/ritsu/reveal/hoshiyomi");
  const stage = page.locator(".reveal-stage");
  await expect(stage).toBeAttached(); // 絵を渡していないので大きさがない
  await page.waitForTimeout(1500); // 幕が開いて最初のセリフが出るまで
  await stage.dispatchEvent("click");
  await stage.dispatchEvent("click");
  await expect(page.locator(".signature")).toBeVisible();
  await expect(page.locator(".special-move")).toHaveCount(0);
  await page.locator(".signature").click();
  await expect(page.locator(".signature")).toHaveCount(0);
  await expect(stage.locator("img")).toHaveAttribute("src", /\/special\/hoshiyomi\/reveal\.webp$/);
});

test("特別な衣装（T069）：視差効果を減らす設定なら全画面の演出を流さない", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.route("**/special/**", () => {});
  await beAdmin(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("tanto.character.theme.v1", "hoshiyomi");
    localStorage.setItem("tanto.character.revealed.v1", JSON.stringify(["hoshiyomi"]));
  });
  await page.goto("/ritsu");
  await page.locator(".special-preview button", { hasText: "登場" }).click();
  await expect(page.locator(".special-move")).toHaveCount(0);
  await context.close();
});

test("特別な衣装の試作：案のタブで切り替えると、画面の飾りが変わる。夜空のタブが出る", async ({ page }) => {
  await page.route("**/special/**", (r) => r.fulfill({ status: 404 }));
  await beAdmin(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("tanto.character.theme.v1", "hoshiyomi");
    localStorage.setItem("tanto.character.revealed.v1", JSON.stringify(["hoshiyomi"]));
    localStorage.setItem("tanto.special.daily.v1", new Date().toDateString());
  });
  await page.goto("/ritsu");
  const html = page.locator("html");
  // アプリ全体の色は、着ている衣装で決まる。選ぶ場所はない
  await expect(html).toHaveAttribute("data-world", "hoshiyomi");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".world-pick")).toHaveCount(0);
  // 夜空は、まだ開いていなければ案内が出て、開くと消える
  await expect(page.locator(".sky-note")).toBeVisible();
  await page.locator(".sky-note button").click();
  await expect(page.locator(".sky-svg")).toBeVisible();
  await page.locator(".ritsu-tabs button", { hasText: "衣装" }).click();
  await expect(page.locator(".sky-note")).toHaveCount(0);
  await page.locator(".ritsu-tabs button", { hasText: "夜空" }).click();
  await expect(page.locator(".sky-svg")).toBeVisible();
  await page.locator(".ritsu-tabs button", { hasText: "案" }).click();
  await page.locator(".ideas-list label", { hasText: "育つもの" }).locator("input").uncheck();
  await expect(page.locator(".ritsu-tabs button", { hasText: "夜空" })).toHaveCount(0);
  await page.locator(".ideas-tab button", { hasText: "全部オフ" }).click();
  await expect(html).toHaveAttribute("data-fx", "");
});

test("管理者の印：押すと一般の見え方になり、もう一度押すと戻る", async ({ page }) => {
  await page.route("**/special/**", (r) => r.fulfill({ status: 404 }));
  await beAdmin(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("tanto.character.theme.v1", "hoshiyomi");
    localStorage.setItem("tanto.character.revealed.v1", JSON.stringify(["hoshiyomi", "pajama"]));
    localStorage.setItem("tanto.special.daily.v1", new Date().toDateString());
  });
  await page.goto("/ritsu");
  const html = page.locator("html");
  const badge = page.locator(".appbar .admin-badge");
  await expect(html).toHaveAttribute("data-costume", "hoshiyomi");
  await expect(page.locator(".theme-tile.locked")).toHaveCount(0);
  await badge.click();
  await expect(badge).toHaveText("一般で表示中");
  await expect(html).not.toHaveAttribute("data-costume", /.+/);
  await expect(page.locator(".special-locked", { hasText: "星詠み" })).toBeDisabled();
  await expect(page.locator(".ritsu-tabs button", { hasText: "案" })).toHaveCount(0);
  await expect(page.locator(".special-preview")).toHaveCount(0);
  await badge.click();
  await expect(badge).toHaveText("管理者");
  await expect(html).toHaveAttribute("data-costume", "hoshiyomi");
});
