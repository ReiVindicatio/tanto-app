import { describe, expect, it } from "vitest";
import worker, { type Env } from "./index";

const env = (over: Partial<Env>): Env =>
  ({
    ASSETS: { fetch: async () => new Response("asset") },
    DB: {} as D1Database,
    FIREBASE_PROJECT_ID: "tantan-test",
    ENVIRONMENT: "production",
    ...over,
  }) as unknown as Env;

describe("Worker の入口", () => {
  it("/api 以外は静的ファイル（アプリ）を返す", async () => {
    const res = await worker.fetch(new Request("https://x.test/"), env({}));
    expect(await res.text()).toBe("asset");
  });

  it("本番でテスト用ログインが有効になっていたら API を止める", async () => {
    const res = await worker.fetch(
      new Request("https://x.test/api/answers", { headers: { authorization: "Bearer test:alice" } }),
      env({ AUTH_MODE: "test", ENVIRONMENT: "production" }),
    );
    expect(res.status).toBe(500);
  });

  it("本番ではテスト用のトークンを受け付けない（Firebase の検証になる）", async () => {
    const res = await worker.fetch(
      new Request("https://x.test/api/answers", { headers: { authorization: "Bearer test:alice" } }),
      env({}),
    );
    expect(res.status).toBe(401);
  });
});
