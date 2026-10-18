import { defineConfig } from "@playwright/test";

// E2E テスト。ビルド済みのアプリ（dist/）を vite preview で立てて流す（先に npm run build）
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 420, height: 900 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
