import { describe, expect, it } from "vitest";
import worker, { SECURITY_HEADERS, type Env } from "./index";

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

  it("Worker が返す応答（API・衣装の配信）にもセキュリティのヘッダーを付ける。通行証の Cookie は消えない（T075）", async () => {
    const api = await worker.fetch(new Request("https://x.test/api/answers"), env({}));
    const logout = await worker.fetch(new Request("https://x.test/special/logout", { method: "POST" }), env({}));
    for (const res of [api, logout]) {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(k)).toBe(v);
    }
    expect(api.status).toBe(401);
    expect(logout.headers.getSetCookie()).toHaveLength(3);
  });

  it("静的なファイルの public/_headers と、Worker のヘッダーが同じ", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("../public/_headers", import.meta.url), "utf-8");
    const lines = text.split("\n").filter((l) => /^\s+\S+:/.test(l)).map((l) => l.trim());
    expect(lines.sort()).toEqual(Object.entries(SECURITY_HEADERS).map(([k, v]) => `${k}: ${v}`).sort());
  });
});
