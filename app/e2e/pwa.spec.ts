import { expect, test } from "@playwright/test";
import { openHome, openYear } from "./helpers";

test("一度開いた年度は、通信を切って再読み込みしても解ける（T030・T038）", async ({ page, context }) => {
  await openHome(page);
  // Service Worker のインストール（画面・JS／CSS・一覧の保存）が終わり、この画面を受け持つのを待つ
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await openYear(page, "刑事訴訟法", "R05", "肢で解く"); // 開いた年度の束が保存される
  await expect(page.getByRole("button", { name: "○", exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.goto("/");
  await expect(page.locator(".hero-breakdown")).not.toContainText("読み込み中");
  await openYear(page, "刑事訴訟法", "R05", "肢で解く");
  await page.getByRole("button", { name: "○", exact: true }).click();
  await expect(page.locator(".page .result")).toBeVisible();
  await context.setOffline(false);
});

test("起動したときは一覧（index.json）だけを読み、年度の束は読まない（T038）", async ({ page }) => {
  const loaded: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/data/") && path !== "/data/index.json") loaded.push(path);
  });
  await openHome(page);
  await expect(page.locator(".hero-breakdown")).not.toContainText("読み込み中");
  await page.waitForTimeout(500);
  expect(loaded).toEqual([]);
});

test("manifest とアイコンが配信される", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200);
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
});
