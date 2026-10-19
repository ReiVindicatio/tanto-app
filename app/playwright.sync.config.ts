import { defineConfig } from "@playwright/test";

// 同期の E2E（T003）。テスト用ログインでビルドしたアプリ（npm run e2e:sync がビルドする）を、
// wrangler dev（Worker＋手元の D1）で配信して流す。本番の設定にはテスト用ログインは入らない。
const PORT = 8788;
const STATE = ".wrangler/e2e-state";

export default defineConfig({
  testDir: "e2e-sync",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 420, height: 900 }, screenshot: "only-on-failure" },
  webServer: {
    command:
      `rm -rf ${STATE} && npx wrangler d1 migrations apply DB --local --persist-to ${STATE} && ` +
      `npx wrangler dev --port ${PORT} --persist-to ${STATE} --var ENVIRONMENT:development --var AUTH_MODE:test`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
