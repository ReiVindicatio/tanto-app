import { expect, test } from "@playwright/test";

// 問ごとの静的ページ・サイトマップ・検索エンジン向けの設定（T044・T045）

test("問のページ：問題文が見え、正解と解説は折りたたまれていて、出典と AI 生成の表示がある", async ({ page, request }) => {
  const data = await (await request.get("/data/yobi-2023-minpo.json")).json();
  const q = data.questions.find((x: { number: number }) => x.number === 11);
  await page.goto(`/q/${q.id}/`);
  // 和暦で書く（T072）
  await expect(page).toHaveTitle("予備試験 令和5年（2023年） 民法 第11問の過去問と解説｜たんたん");
  await expect(page.locator("h1")).toHaveText("予備試験 令和5年（2023年） 民法 第11問");
  const crumbs = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(crumbs["@type"]).toBe("BreadcrumbList");
  expect(crumbs.itemListElement.at(-1).item).toMatch(new RegExp(`/q/${q.id}/$`));
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

test("問題文が「〇〇に関する次の…」なら、テーマを見出しとタイトルに入れる", async ({ page }) => {
  await page.goto("/q/shiho-2012-keiso-q24/");
  await expect(page.locator("h1")).toHaveText("司法試験 平成24年（2012年） 刑事訴訟法 第24問（告訴）");
  await expect(page).toHaveTitle("司法試験 平成24年（2012年） 刑事訴訟法 第24問（告訴）の過去問と解説｜たんたん");
});

test("一覧から年度・問へたどれ、アプリへ戻れる", async ({ page }) => {
  await page.goto("/q/");
  await page.getByRole("link", { name: "R05" }).first().click();
  await expect(page.locator("h1")).toContainText("令和5年");
  await page.locator("ul.list a").first().click();
  await expect(page.locator("h1")).toContainText(/第\d+問/); // 行政法は憲法の続きの番号から始まる
  await page.locator("a.cta").click();
  await expect(page.locator(".appbar")).toContainText("たんたん");
});

test("検索エンジン向け：robots.txt は /api/ だけ止め、サイトマップの目次から問のページへたどれ、アプリに noindex がない", async ({ page, request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /api/");
  expect(robots).not.toMatch(/Disallow: \/\s*$/m);
  // 目次（T072）→ 試験・年度ごとのサイトマップ → 問のページ。アプリの画面の URL は入れない
  const index = await (await request.get("/sitemap.xml")).text();
  expect(index).toContain("<sitemapindex");
  expect(index).toContain("/sitemaps/yobi-2023.xml</loc>");
  const child = await request.get("/sitemaps/yobi-2023.xml");
  expect(child.headers()["content-type"]).toContain("xml");
  const year = await child.text();
  expect(year).toMatch(/\/q\/yobi-2023-minpo-q11\/<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  expect(await (await request.get("/sitemaps/top.xml")).text()).not.toContain("/subjects");
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /非公式/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /workers\.dev\/$/);
});

test("IndexNow の鍵のファイルが配信され、サイトマップの目次から全部の URL を数えられる（T073）", async ({ request }) => {
  const { KEY, parseSitemap } = await import("../scripts/indexnow.mjs");
  expect((await (await request.get(`/${KEY}.txt`)).text()).trim()).toBe(KEY);
  const children = parseSitemap(await (await request.get("/sitemap.xml")).text());
  expect(children.length).toBeGreaterThan(10);
  const year = parseSitemap(await (await request.get(new URL(children.at(-1)![0]).pathname)).text());
  expect(year.length).toBeGreaterThan(0);
  expect(year[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
