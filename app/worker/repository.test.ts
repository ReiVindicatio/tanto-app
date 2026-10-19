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
});
