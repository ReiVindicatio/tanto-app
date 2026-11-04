import { describe, expect, it } from "vitest";
import { passCookie, serveSpecial, trialCookie, validPass, validTrial } from "./special";
import { handleApi } from "./api";
import { testVerifier } from "./auth";
import { MemoryAnswerRepository } from "./repository";

const NOW = new Date("2026-11-01T00:00:00Z");
const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const asked: string[] = [];
const bucket = {
  async get(key: string, opts?: { range?: Headers }) {
    asked.push(key);
    if (key !== "special/hoshiyomi/wind-map.png" && key !== "special/hoshiyomi/entrance.mp4" && key !== "special/hoshiyomi/voices/wear_hoshiyomi-001.mp3") return null;
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

  it("布を動かす範囲の地図（png）も渡す（これが 404 だと、風を受ける座り絵がふつうの絵に戻る）", async () => {
    const res = await serveSpecial(req("/special/hoshiyomi/wind-map.png", await cookieOf()), bucket, "k", NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
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

describe("特別な衣装のお試しと、買う前に見せる絵（T070）", () => {
  const LATER = new Date(NOW.getTime() + 48 * 3600 * 1000);
  const trial = async (costume = "hoshiyomi", expires = LATER, key = "k") => (await trialCookie("alice", costume, expires, key, NOW)).split(";")[0];
  const pub = {
    async get(key: string) {
      asked.push(key);
      return { size: 8, httpEtag: '"e"', body: new Blob([bytes]).stream() };
    },
  } as unknown as R2Bucket;

  it("全身の絵だけは通行証なしで渡す。ほかの絵・声・動画は渡さない", async () => {
    expect((await serveSpecial(req("/special/diva/base-smile.webp"), pub, "k", NOW)).status).toBe(200);
    asked.length = 0;
    for (const f of ["base-smug.webp", "base-smile-evo2.webp", "base-smile-talk.webp", "reveal.webp", "motion-a.mp4", "voices/a.mp3"]) {
      expect((await serveSpecial(req(`/special/diva/${f}`), pub, "k", NOW)).status).toBe(403);
    }
    expect((await serveSpecial(req("/special/diva/base-smile.webp"), pub, undefined, NOW)).status).toBe(403); // 鍵の設定がなければ、だれにも渡さない
    expect(asked).toEqual([]);
  });

  it("お試しの通行証は、その1着のファイルだけ開く", async () => {
    const c = await trial();
    expect((await serveSpecial(req("/special/hoshiyomi/motion-a.mp4", c), pub, "k", NOW)).status).toBe(200);
    expect((await serveSpecial(req("/special/diva/motion-a.mp4", c), pub, "k", NOW)).status).toBe(403);
    expect((await serveSpecial(req("/special/hoshiyomi-x/motion-a.mp4", c), pub, "k", NOW)).status).toBe(403);
  });

  it("お試しの通行証：期限切れ・書き換え・別の鍵は断る。全着の通行証としては使えない", async () => {
    const c = await trial();
    const path = "hoshiyomi/a.webp";
    expect(await validTrial(c, path, "k", NOW)).toBe(true);
    expect(await validTrial(c, path, "k", LATER)).toBe(false);
    expect(await validTrial(c, path, "other", NOW)).toBe(false);
    expect(await validTrial(c.replace("hoshiyomi", "diva"), "diva/a.webp", "k", NOW)).toBe(false);
    const [body, costume, exp, mac] = c.split(".");
    expect(await validTrial(`${body}.${costume}.${Number(exp) + 999}.${mac}`, path, "k", NOW)).toBe(false);
    expect(await validPass(c.replace("tanto_trial", "tanto_special"), "k", NOW)).toBe(false);
    // 全着の通行証を、お試しの通行証に見せかけても通らない（署名の対象が違う）
    const pass = (await passCookie("alice", "k", NOW)).split(";")[0].replace("tanto_special=", "");
    const [u, e, m] = pass.split(".");
    expect(await validTrial(`tanto_trial=${u}.hoshiyomi.${e}.${m}`, path, "k", NOW)).toBe(false);
  });

  it("ログアウトでお試しの通行証も消す", async () => {
    const res = await serveSpecial(new Request("https://x.test/special/logout", { method: "POST" }), bucket, "k", NOW);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("tanto_special=;"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("tanto_trial=;"))).toBe(true);
  });

  const api = (repo = new MemoryAnswerRepository(), at = NOW, specialKey: string | null = "k") => ({ repo, verify: testVerifier(), specialKey: specialKey ?? undefined, now: () => at });
  const post = (path: string, body?: unknown, user = "alice") =>
    new Request(`https://x.test${path}`, { method: "POST", headers: { authorization: `Bearer test:${user}` }, body: body === undefined ? undefined : JSON.stringify(body) });

  it("/api/special/trial：1人1回。48時間の内は通行証を出し直し、過ぎたら出さない。ログインが要る", async () => {
    const repo = new MemoryAnswerRepository();
    const first = await handleApi(post("/api/special/trial"), api(repo));
    expect(await first.json()).toEqual({ available: true, costume: "hoshiyomi", until: LATER.toISOString() });
    expect(await validTrial(first.headers.get("set-cookie")!.split(";")[0], "hoshiyomi/a.webp", "k", NOW)).toBe(true);

    // 途中で別の端末から：期限は最初のまま
    const soon = new Date(NOW.getTime() + 3600 * 1000);
    expect(await (await handleApi(post("/api/special/trial"), api(repo, soon))).json()).toMatchObject({ available: true, until: LATER.toISOString() });

    const over = await handleApi(post("/api/special/trial"), api(repo, LATER));
    expect(await over.json()).toEqual({ available: false });
    expect(over.headers.get("set-cookie")).toBeNull();

    // 別の人は別に数える
    expect(await (await handleApi(post("/api/special/trial", undefined, "bob"), api(repo, LATER))).json()).toMatchObject({ available: true });
    expect((await handleApi(new Request("https://x.test/api/special/trial", { method: "POST" }), api(repo))).status).toBe(401);
  });

  it("/api/special/trial：鍵の設定がないときは、回数を使わせない", async () => {
    const repo = new MemoryAnswerRepository();
    expect(await (await handleApi(post("/api/special/trial"), api(repo, NOW, null))).json()).toEqual({ available: false });
    expect(repo.interest.size).toBe(0);
  });

  it("/api/special/want：記録と取り消し。知らない衣装は断る。お試しの回数に影響しない。退会で消える", async () => {
    const repo = new MemoryAnswerRepository();
    expect((await handleApi(post("/api/special/want", { costume: "diva", want: true }), api(repo))).status).toBe(200);
    expect(repo.interest.get("test-alice\ndiva")).toEqual({ wanted_at: NOW.toISOString() });
    await handleApi(post("/api/special/want", { costume: "diva", want: false }), api(repo));
    expect(repo.interest.get("test-alice\ndiva")?.wanted_at).toBeNull();

    await handleApi(post("/api/special/want", { costume: "hoshiyomi", want: true }), api(repo));
    expect(await (await handleApi(post("/api/special/trial"), api(repo))).json()).toMatchObject({ available: true });
    await handleApi(post("/api/special/want", { costume: "hoshiyomi", want: false }), api(repo));
    expect(repo.interest.get("test-alice\nhoshiyomi")?.tried_at).toBe(NOW.toISOString());

    for (const bad of [{ costume: "default", want: true }, { costume: "diva" }, { want: true }, "x"]) {
      expect((await handleApi(post("/api/special/want", bad), api(repo))).status).toBe(400);
    }
    await handleApi(new Request("https://x.test/api/me", { method: "DELETE", headers: { authorization: "Bearer test:alice" } }), api(repo));
    expect(repo.interest.size).toBe(0);
  });
});
