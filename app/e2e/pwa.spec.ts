import { expect, test } from "@playwright/test";
import { openHome, openYear } from "./helpers";

test("一度開いた後は、通信を切って再読み込みしてもホームが出て肢を解ける（T030）", async ({ page, context }) => {
  await openHome(page);
  // Service Worker のインストール（画面・JS／CSS・全データの保存）が終わるのを待つ
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".hero-breakdown")).not.toContainText("読み込み中");
  await openYear(page, "刑事訴訟法", "R05", "肢で解く"); // 一度も開いていない年度のデータも保存済み
  await page.getByRole("button", { name: "○", exact: true }).click();
  await expect(page.locator(".result")).toBeVisible();
  await context.setOffline(false);
});

test("manifest とアイコンが配信される", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200);
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
});
