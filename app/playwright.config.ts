import { defineConfig } from "@playwright/test";

// E2E テスト。既定ではビルド済みのアプリ（dist/）を vite preview で立てて流す（先に npm run build）。
// BASE_URL を渡すと、その URL（公開先など）に向けて流す：BASE_URL=https://tantan.reivindicatio0321.workers.dev npm run e2e
const external = process.env.BASE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: external ?? "http://localhost:4173",
    viewport: { width: 420, height: 900 },
    screenshot: "only-on-failure",
  },
  webServer: external
    ? undefined
    : {
        command: "npx vite preview --port 4173 --strictPort",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
      },
});
