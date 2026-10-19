import { describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { handleApi, MAX_BATCH } from "./api";
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
