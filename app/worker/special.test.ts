import { describe, expect, it } from "vitest";
import { passCookie, serveSpecial, validPass } from "./special";
import { handleApi } from "./api";
import { testVerifier } from "./auth";
import { MemoryAnswerRepository } from "./repository";

const NOW = new Date("2026-11-01T00:00:00Z");
const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const asked: string[] = [];
const bucket = {
  async get(key: string, opts?: { range?: Headers }) {
    asked.push(key);
    if (key !== "special/hoshiyomi/entrance.mp4" && key !== "special/hoshiyomi/voices/wear_hoshiyomi-001.mp3") return null;
    const h = opts?.range?.get("range");
    if (h) {
      const [a, b] = h.replace("bytes=", "").split("-").map(Number);
      return { size: 8, httpEtag: '"e"', range: { offset: a, length: b - a + 1 }, body: new Blob([bytes.slice(a, b + 1)]).stream() };
    }
    return { size: 8, httpEtag: '"e"', body: new Blob([bytes]).stream() };
  },
} as unknown as R2Bucket;

const cookieOf = async (key = "k", at = NOW) => (await passCookie("alice", key, at)).split(";")[0];
const req = (path: string, cookie?: string, headers: Record<string, string> = {}) =>
  new Request(`https://x.test${path}`, { headers: { ...(cookie ? { cookie } : {}), ...headers } });

describe("特別な衣装の配信（T069）", () => {
  it("通行証があれば R2 の special/ から返す。共有のキャッシュには載せない", async () => {
    const res = await serveSpecial(req("/special/hoshiyomi/entrance.mp4", await cookieOf()), bucket, "k", NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("声は voices/ の下から返す", async () => {
    const res = await serveSpecial(req("/special/hoshiyomi/voices/wear_hoshiyomi-001.mp3", await cookieOf()), bucket, "k", NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
  });

  it("動画の Range には 206 で答える（iPhone の Safari）", async () => {
    const res = await serveSpecial(req("/special/hoshiyomi/entrance.mp4", await cookieOf(), { range: "bytes=2-5" }), bucket, "k", NOW);
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-5/8");
  });

  it("通行証がない・偽物・別の鍵・期限切れ・鍵の設定がないなら、R2 を読まずに断る", async () => {
    asked.length = 0;
    const path = "/special/hoshiyomi/entrance.mp4";
    const good = await cookieOf();
    const [body, exp, mac] = good.split(".");
    const cases = [
      await serveSpecial(req(path), bucket, "k", NOW),
      await serveSpecial(req(path, `${good}x`), bucket, "k", NOW),
      await serveSpecial(req(path, `${body}.${Number(exp) + 999999}.${mac}`), bucket, "k", NOW), // 期限を書き換えた
      await serveSpecial(req(path, await cookieOf("other")), bucket, "k", NOW),
      await serveSpecial(req(path, good), bucket, "k", new Date("2026-11-09T00:00:00Z")),
      await serveSpecial(req(path, good), bucket, undefined, NOW),
    ];
    expect(cases.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(asked).toEqual([]);
  });

  it("形の違うパス・ないファイルは 404。special/ の外は読めない", async () => {
    const good = await cookieOf();
    expect((await serveSpecial(req("/special/hoshiyomi/none.webp", good), bucket, "k", NOW)).status).toBe(404);
    expect((await serveSpecial(req("/special/tts/v/a.q.txt", good), bucket, "k", NOW)).status).toBe(404);
    expect((await serveSpecial(req("/special/..%2Ftts/a.mp3", good), bucket, "k", NOW)).status).toBe(404);
  });

  it("ログアウトで通行証を消す", async () => {
    const res = await serveSpecial(new Request("https://x.test/special/logout", { method: "POST" }), bucket, "k", NOW);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("/api/me：管理者にだけ通行証を出し、それ以外は消す", async () => {
    const deps = (email: string | null) => ({
      repo: new MemoryAnswerRepository(),
      verify: testVerifier(),
      emailOf: async () => email,
      adminEmails: "boss@example.com",
      specialKey: "k",
      now: () => NOW,
    });
    const me = () => new Request("https://x.test/api/me", { headers: { authorization: "Bearer test:alice" } });
    const admin = await handleApi(me(), deps("boss@example.com"));
    expect(await admin.json()).toEqual({ admin: true });
    expect(await validPass(admin.headers.get("set-cookie")!.split(";")[0], "k", NOW)).toBe(true);
    expect(admin.headers.get("set-cookie")).toContain("HttpOnly");

    const other = await handleApi(me(), deps("someone@example.com"));
    expect(await other.json()).toEqual({ admin: false });
    expect(other.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
