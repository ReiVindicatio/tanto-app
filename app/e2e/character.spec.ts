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

test("お披露目（T065）：Lv.3 でニットが開くと、ホームに案内。幕が開いてセリフを最後まで聞くと着てもらえ、アルバムに並ぶ", async ({ page }) => {
  // 初めての肢を25問正解（経験値50）＝ Lv.3
  await page.addInitScript(() => {
    if (localStorage.getItem("tanto.log.v1")) return;
    const now = new Date().toISOString();
    const log = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, s: `yobi-2026-minpo-q${String(i + 1).padStart(2, "0")}-a`, ok: true, at: now }));
    localStorage.setItem("tanto.log.v1", JSON.stringify(log));
  });
  await openHome(page);
  await expect(page.locator(".streak-chip")).toContainText("Lv.3");
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
  // 一度見たら、ホームの案内は出ない
  await tab(page, "ホーム").click();
  await expect(page.locator(".reveal-invite")).toHaveCount(0);
});

test("律のページの背景（T065）：既定は衣装に合わせる。選ぶと立ち絵の後ろが変わり、覚える", async ({ page }) => {
  await openHome(page);
  await page.locator(".streak-chip").click();
  const stage = page.locator(".ritsu-stage");
  await expect(stage).toHaveAttribute("style", /chars\/bg\/room\.webp/);
  await page.getByRole("tab", { name: "背景" }).click();
  await page.locator(".bg-tile", { hasText: "図書館" }).click();
  await expect(stage).toHaveAttribute("style", /chars\/bg\/library\.webp/);
  await page.reload();
  await expect(page.locator(".ritsu-stage")).toHaveAttribute("style", /chars\/bg\/library\.webp/);
});
