import { describe, expect, it } from "vitest";
import { D1AnswerRepository, INSERT_CHUNK } from "./repository";
import { MAX_BATCH } from "./api";

/** D1 の代わり：無料プランの上限（1回の呼び出しで SQL 50回まで・1つの SQL に渡せる値は100個まで・SQL 文は100KBまで）をまねる */
function fakeD1() {
  const seen = { statements: 0, maxParams: 0, maxSqlBytes: 0 };
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          seen.maxParams = Math.max(seen.maxParams, params.length);
          seen.maxSqlBytes = Math.max(seen.maxSqlBytes, new TextEncoder().encode(sql).length);
          return { sql, params };
        },
      };
    },
    async batch(stmts: { params: unknown[] }[]) {
      seen.statements += stmts.length;
      if (stmts.length > 50) throw new Error("Too many API requests by single worker invocation");
      return stmts.map((st) => ({ meta: { changes: JSON.parse(st.params[2] as string).length } }));
    },
  };
  return { db: db as unknown as D1Database, seen };
}

describe("D1AnswerRepository", () => {
  it(`1回の上限（${MAX_BATCH}件）を送っても、D1 の無料プランの上限に収まる`, async () => {
    const { db, seen } = fakeD1();
    const answers = Array.from({ length: MAX_BATCH }, (_, i) => ({ id: `id-${i}`, s: "yobi-2026-minpo-q01-a", ok: i % 2 === 0, at: "2026-10-19T00:00:00.000Z" }));
    const inserted = await new D1AnswerRepository(db).insert("uid-1", answers, "2026-10-19T12:00:00.000Z");
    expect(inserted).toBe(MAX_BATCH);
    expect(seen.statements).toBe(Math.ceil(MAX_BATCH / INSERT_CHUNK));
    expect(seen.statements).toBeLessThanOrEqual(50);
    expect(seen.maxParams).toBeLessThanOrEqual(100);
    expect(seen.maxSqlBytes).toBeLessThanOrEqual(100_000);
  });

  it(`回答と★の操作を上限まで同じ呼び出しで送っても、SQL の回数が上限（50回）に収まる（T026）`, async () => {
    const { db, seen } = fakeD1();
    const repo = new D1AnswerRepository(db);
    const at = "2026-10-22T00:00:00.000Z";
    await repo.insert("uid-1", Array.from({ length: MAX_BATCH }, (_, i) => ({ id: `a-${i}`, s: "yobi-2026-minpo-q01-a", ok: true, at })), at);
    const n = await repo.insertBookmarks("uid-1", Array.from({ length: MAX_BATCH }, (_, i) => ({ id: `m-${i}`, s: "yobi-2026-minpo-q01-a", on: i % 2 === 0, at })), at);
    expect(n).toBe(MAX_BATCH);
    // 上限の確認2回（回答・★の数）を足しても50回に収まる
    expect(seen.statements + 2).toBeLessThanOrEqual(50);
    expect(seen.maxParams).toBeLessThanOrEqual(100);
  });
});
