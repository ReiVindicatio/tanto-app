import { expect, test } from "@playwright/test";

// 問ごとの静的ページ・サイトマップ・検索エンジン向けの設定（T044・T045）

test("問のページ：問題文が見え、正解と解説は折りたたまれていて、出典と AI 生成の表示がある", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2023-minpo.json")).json();
  const q = data.questions.find((x: { number: number }) => x.number === 11);
  await page.goto(`/q/${q.id}/`);
  await expect(page).toHaveTitle(/予備試験 R05（2023年） 民法 第11問｜たんたん/);
  await expect(page.locator("h1")).toHaveText("予備試験 R05（2023年） 民法 第11問");
  await expect(page.locator("main")).toContainText(data.statements.find((s: { id: string }) => s.id === q.statements[0]).text);
  const answer = page.locator("details.answer");
  await expect(answer.locator(".ai").first()).toBeHidden();
  await answer.locator(":scope > summary").click();
  await expect(answer).toContainText("公式の正解");
  await expect(answer.locator(".ai").first()).toBeVisible();
  await expect(page.locator("footer")).toContainText("出典：法務省ウェブサイト");
  await expect(page.locator("footer")).toContainText("法務省とは関係のない個人が作成した非公式のもの");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/q/${q.id}/$`));
});

test("一覧から年度・問へたどれ、アプリへ戻れる", async ({ page }) => {
  await page.goto("/q/");
  await page.getByRole("link", { name: "R05" }).first().click();
  await expect(page.locator("h1")).toContainText("R05");
  await page.locator("ul.list a").first().click();
  await expect(page.locator("h1")).toContainText(/第\d+問/); // 行政法は憲法の続きの番号から始まる
  await page.locator("a.cta").click();
  await expect(page.locator(".appbar")).toContainText("たんたん");
});

test("検索エンジン向け：robots.txt は /api/ だけ止め、サイトマップに問のページがあり、アプリに noindex がない", async ({ page, request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /api/");
  expect(robots).not.toMatch(/Disallow: \/\s*$/m);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/q/yobi-2023-minpo-q11/</loc>");
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /非公式/);
});
