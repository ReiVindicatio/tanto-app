import { describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { DAILY_ANSWERS, DAILY_REPORTS, handleApi, MAX_BATCH, REPORT_BODY_MAX } from "./api";
import { firebaseVerifier, testVerifier } from "./auth";
import { MemoryAnswerRepository } from "./repository";

const PROJECT = "tantan-test";
const a = (id: string, s = "yobi-2026-minpo-q01-a", ok = true, at = "2026-10-19T00:00:00.000Z") => ({ id, s, ok, at });

function req(method: string, path: string, token?: string, body?: unknown) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("API（テスト用ログインで）", () => {
  const deps = () => ({ repo: new MemoryAnswerRepository(), verify: testVerifier(), now: () => new Date("2026-10-19T12:00:00.000Z") });

  it("トークンがなければ 401", async () => {
    expect((await handleApi(req("GET", "/api/answers"), deps())).status).toBe(401);
    expect((await handleApi(req("GET", "/api/answers", "bogus"), deps())).status).toBe(401);
  });

  it("送った回答を読み直せる。同じ回答 ID は二重にならない", async () => {
    const d = deps();
    const r1 = await handleApi(req("POST", "/api/answers", "test:alice", { answers: [a("1"), a("2")] }), d);
    expect(await r1.json()).toMatchObject({ inserted: 2 });
    const r2 = await handleApi(req("POST", "/api/answers", "test:alice", { answers: [a("2"), a("3")] }), d);
    expect(await r2.json()).toMatchObject({ inserted: 1 });
    const list = await (await handleApi(req("GET", "/api/answers", "test:alice"), d)).json();
    expect(list.answers.map((x: { id: string }) => x.id)).toEqual(["1", "2", "3"]);
  });

  it("他人の記録は見えず、消せもしない", async () => {
    const d = deps();
    await handleApi(req("POST", "/api/answers", "test:alice", { answers: [a("1")] }), d);
    const bob = await (await handleApi(req("GET", "/api/answers", "test:bob"), d)).json();
    expect(bob.answers).toEqual([]);
    await handleApi(req("DELETE", "/api/me", "test:bob"), d);
    const alice = await (await handleApi(req("GET", "/api/answers", "test:alice"), d)).json();
    expect(alice.answers).toHaveLength(1);
  });

  it("since 以降に受け取った分だけ返す", async () => {
    const repo = new MemoryAnswerRepository();
    await handleApi(req("POST", "/api/answers", "test:alice", { answers: [a("1")] }), { repo, verify: testVerifier(), now: () => new Date("2026-10-19T01:00:00.000Z") });
    await handleApi(req("POST", "/api/answers", "test:alice", { answers: [a("2")] }), { repo, verify: testVerifier(), now: () => new Date("2026-10-19T02:00:00.000Z") });
    const r = await (await handleApi(req("GET", "/api/answers?since=2026-10-19T01:00:00.000Z", "test:alice"), { repo, verify: testVerifier() })).json();
    expect(r.answers.map((x: { id: string }) => x.id)).toEqual(["2"]);
  });

  it("入力を検査する（肢 ID の形・真偽値・日時・件数）", async () => {
    const d = deps();
    const bad = [
      [{ ...a("1"), s: "drop table" }],
      [{ ...a("1"), ok: "yes" }],
      [{ ...a("1"), at: "昨日" }],
      [{ ...a("1"), id: "x".repeat(100) }],
    ];
    for (const answers of bad) expect((await handleApi(req("POST", "/api/answers", "test:alice", { answers }), d)).status).toBe(400);
    const many = Array.from({ length: MAX_BATCH + 1 }, (_, i) => a(String(i)));
    expect((await handleApi(req("POST", "/api/answers", "test:alice", { answers: many }), d)).status).toBe(400);
    expect((await handleApi(req("POST", "/api/answers", "test:alice", { answers: [a("1", "yobi-2014-minpo-q05-1-2")] }), d)).status).toBe(200);
  });

  it("自分の記録を全部消せる", async () => {
    const d = deps();
    await handleApi(req("POST", "/api/answers", "test:alice", { answers: [a("1")] }), d);
    expect((await handleApi(req("DELETE", "/api/me", "test:alice"), d)).status).toBe(200);
    const r = await (await handleApi(req("GET", "/api/answers", "test:alice"), d)).json();
    expect(r.answers).toEqual([]);
  });
});

describe("誤り報告（T040）", () => {
  const rep = (over: Record<string, unknown> = {}) => ({
    id: "r1",
    target: "yobi-2026-minpo-q01-a",
    kind: "explanation",
    body: "条文の番号が違うようです",
    context: JSON.stringify({ prompt_version: "explain-v2" }),
    ...over,
  });
  const deps = () => {
    const repo = new MemoryAnswerRepository();
    return { repo, verify: testVerifier(), now: () => new Date("2026-10-20T12:00:00.000Z") };
  };

  it("ログインしていれば報告を送れる。同じ報告 ID は二重にならない", async () => {
    const d = deps();
    expect((await handleApi(req("POST", "/api/reports", undefined, rep()), d)).status).toBe(401);
    expect((await handleApi(req("POST", "/api/reports", "test:alice", rep()), d)).status).toBe(200);
    expect((await handleApi(req("POST", "/api/reports", "test:alice", rep()), d)).status).toBe(200);
    expect(d.repo.reports).toHaveLength(1);
    expect(d.repo.reports[0]).toMatchObject({ user_id: "test-alice", target: "yobi-2026-minpo-q01-a", kind: "explanation" });
  });

  it("問 ID にも報告できる", async () => {
    const d = deps();
    expect((await handleApi(req("POST", "/api/reports", "test:alice", rep({ target: "shiho-2025-keiho-q06", kind: "truth" })), d)).status).toBe(200);
  });

  it("入力を検査する（対象の形・種別・本文の長さ・付加情報の長さ）", async () => {
    const d = deps();
    const bad = [
      rep({ target: "drop table" }),
      rep({ kind: "spam" }),
      rep({ body: "   " }),
      rep({ body: "あ".repeat(REPORT_BODY_MAX + 1) }),
      rep({ context: "x".repeat(3000) }),
      rep({ id: "x".repeat(100) }),
    ];
    for (const r of bad) expect((await handleApi(req("POST", "/api/reports", "test:alice", r), d)).status).toBe(400);
    expect((await handleApi(req("POST", "/api/reports", "test:alice", rep({ body: "あ".repeat(REPORT_BODY_MAX) })), d)).status).toBe(200);
  });

  it(`1日に ${DAILY_REPORTS} 件を超えたら 429（翌日はまた送れる）`, async () => {
    const d = deps();
    for (let i = 0; i < DAILY_REPORTS; i++) expect((await handleApi(req("POST", "/api/reports", "test:alice", rep({ id: `r${i}` })), d)).status).toBe(200);
    expect((await handleApi(req("POST", "/api/reports", "test:alice", rep({ id: "over" })), d)).status).toBe(429);
    expect((await handleApi(req("POST", "/api/reports", "test:bob", rep({ id: "bob" })), d)).status).toBe(200); // 他の人は送れる
    const tomorrow = { ...d, now: () => new Date("2026-10-21T00:00:01.000Z") };
    expect((await handleApi(req("POST", "/api/reports", "test:alice", rep({ id: "next" })), tomorrow)).status).toBe(200);
  });

  it("退会しても報告は残り、送った人だけ消える", async () => {
    const d = deps();
    await handleApi(req("POST", "/api/reports", "test:alice", rep()), d);
    await handleApi(req("DELETE", "/api/me", "test:alice"), d);
    expect(d.repo.reports).toHaveLength(1);
    expect(d.repo.reports[0].user_id).toBeNull();
  });
});

describe("使いすぎの制限（T040）", () => {
  const counter = (max: number) => {
    const n = new Map<string, number>();
    return async (key: string) => {
      n.set(key, (n.get(key) ?? 0) + 1);
      return n.get(key)! <= max;
    };
  };
  const withIp = (r: Request, ip: string) => {
    const h = new Headers(r.headers);
    h.set("cf-connecting-ip", ip);
    return new Request(r, { headers: h });
  };

  it("利用者ごとの上限を超えたら 429。他の利用者は使える", async () => {
    const d = { repo: new MemoryAnswerRepository(), verify: testVerifier(), limitUser: counter(2) };
    expect((await handleApi(req("GET", "/api/answers", "test:alice"), d)).status).toBe(200);
    expect((await handleApi(req("GET", "/api/answers", "test:alice"), d)).status).toBe(200);
    expect((await handleApi(req("GET", "/api/answers", "test:alice"), d)).status).toBe(429);
    expect((await handleApi(req("GET", "/api/answers", "test:bob"), d)).status).toBe(200);
  });

  it("IP ごとの上限は、ログインの確認より前に効く", async () => {
    const d = { repo: new MemoryAnswerRepository(), verify: testVerifier(), limitIp: counter(1) };
    expect((await handleApi(withIp(req("GET", "/api/answers"), "1.2.3.4"), d)).status).toBe(401);
    expect((await handleApi(withIp(req("GET", "/api/answers", "test:alice"), "1.2.3.4"), d)).status).toBe(429);
    expect((await handleApi(withIp(req("GET", "/api/answers", "test:alice"), "5.6.7.8"), d)).status).toBe(200);
  });

  it(`回答は1日に ${DAILY_ANSWERS} 件まで。超える送信は 429 で、何も保存しない`, async () => {
    const repo = new MemoryAnswerRepository();
    const d = { repo, verify: testVerifier(), now: () => new Date("2026-10-20T12:00:00.000Z") };
    for (let k = 0; k < DAILY_ANSWERS / MAX_BATCH; k++) {
      const batch = Array.from({ length: MAX_BATCH }, (_, i) => a(`${k}-${i}`));
      expect((await handleApi(req("POST", "/api/answers", "test:alice", { answers: batch }), d)).status).toBe(200);
    }
    expect((await handleApi(req("POST", "/api/answers", "test:alice", { answers: [a("over")] }), d)).status).toBe(429);
    expect(await repo.countAnswersSince("test-alice", "2026-10-20T00:00:00.000Z")).toBe(DAILY_ANSWERS);
    const tomorrow = { ...d, now: () => new Date("2026-10-21T00:00:01.000Z") };
    expect((await handleApi(req("POST", "/api/answers", "test:alice", { answers: [a("over")] }), tomorrow)).status).toBe(200);
  });
});

describe("Firebase の ID トークンの検証", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const verify = firebaseVerifier(PROJECT, createLocalJWKSet({ keys: [jwk] }));
  const sign = (claims: { iss?: string; aud?: string; sub?: string; exp?: string }) =>
    new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(claims.iss ?? `https://securetoken.google.com/${PROJECT}`)
      .setAudience(claims.aud ?? PROJECT)
      .setSubject(claims.sub ?? "uid-123")
      .setIssuedAt()
      .setExpirationTime(claims.exp ?? "1h")
      .sign(privateKey);

  it("正しいトークンなら利用者 ID を返す", async () => {
    expect(await verify(await sign({}))).toBe("uid-123");
  });
  it("発行者・対象が違う、期限切れ、別の鍵で署名したトークンは拒否する", async () => {
    expect(await verify(await sign({ iss: "https://securetoken.google.com/other" }))).toBeNull();
    expect(await verify(await sign({ aud: "other" }))).toBeNull();
    expect(await verify(await sign({ exp: "-1m" }))).toBeNull();
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT).setSubject("uid-123").setIssuedAt().setExpirationTime("1h").sign(other.privateKey);
    expect(await verify(forged)).toBeNull();
  });
});
