import { describe, expect, it } from "vitest";
import { initLearning } from "./learning";
import { buildDaily, describeCounts } from "./daily";
import { ans, MemoryStore } from "./test/fakes";

const item = (subj: string, q: number, l: string) => {
  const qid = `yobi-2026-${subj}-q${String(q).padStart(2, "0")}`;
  return { id: `${qid}-${l}`, question_id: qid };
};
const now = new Date("2026-12-01T12:00:00.000Z");

describe("buildDaily（今日の○問）", () => {
  it("復習（期限の古い順）→ まちがえた → 新規 → おさらい の順に、指定数ちょうど選ぶ", async () => {
    await initLearning(
      new MemoryStore([
        ans(item("minpo", 1, "a").id, false, "2026-10-01T00:00:00.000Z"), // 期限切れ（古い）
        ans(item("minpo", 2, "a").id, false, "2026-09-01T00:00:00.000Z"), // 期限切れ（もっと古い）
        ans(item("minpo", 3, "a").id, false, "2026-11-30T13:00:00.000Z"), // まちがえた（前日。翌日の期限の前）
        ans(item("minpo", 4, "a").id, true, "2026-11-29T12:00:00.000Z"), // 正解（3日後の期限の前）＝おさらい
      ]),
    );
    const pool = [1, 2, 3, 4, 5, 6].map((q) => item("minpo", q, "a"));
    const r = buildDaily(pool, 6, now, false);
    expect(r.cards.map((c) => c.question_id.slice(-2))).toEqual(["02", "01", "03", "05", "06", "04"]);
    expect(r.counts).toEqual({ due: 2, wrong: 1, fresh: 2, again: 1 });
    expect(describeCounts(r.counts)).toBe("復習 2・まちがえた 1・新規 2・おさらい 1");
    expect(buildDaily(pool, 3, now, false).cards).toHaveLength(3);
  });

  it("今日答えた肢は、正解でも不正解でも今日はもう出さない（T037：同じ日のうちの短い間隔の復習を切った）", async () => {
    await initLearning(
      new MemoryStore([
        ans(item("minpo", 1, "a").id, false, "2026-12-01T11:50:00.000Z"),
        ans(item("minpo", 2, "a").id, true, "2026-12-01T11:40:00.000Z"),
      ]),
    );
    const pool = [1, 2, 3].map((q) => item("minpo", q, "a"));
    const r = buildDaily(pool, 3, now, false);
    expect(r.cards.map((c) => c.question_id.slice(-2))).toEqual(["03"]);
    expect(r.counts).toEqual({ due: 0, wrong: 0, fresh: 1, again: 0 });
  });

  it("同じ問の肢は1回に1枚まで。足りなければ指定数より少なくなる", async () => {
    await initLearning(new MemoryStore());
    const pool = [item("minpo", 1, "a"), item("minpo", 1, "b"), item("minpo", 2, "a")];
    const r = buildDaily(pool, 10, now, false);
    expect(r.cards.map((c) => c.id)).toEqual([item("minpo", 1, "a").id, item("minpo", 2, "a").id]);
  });

  it("新規は科目を交互に入れる（各科目の中は渡された順）", async () => {
    await initLearning(new MemoryStore());
    const pool = [
      item("minpo", 1, "a"),
      item("minpo", 2, "a"),
      item("minpo", 3, "a"),
      item("keiho", 1, "a"),
      item("keiho", 2, "a"),
    ];
    const r = buildDaily(pool, 4, now, false);
    expect(r.cards.map((c) => c.id)).toEqual([
      item("minpo", 1, "a").id,
      item("keiho", 1, "a").id,
      item("minpo", 2, "a").id,
      item("keiho", 2, "a").id,
    ]);
  });

  it("シャッフルしても中身（集合）は同じ", async () => {
    await initLearning(new MemoryStore());
    const pool = Array.from({ length: 40 }, (_, q) => item("minpo", q + 1, "a"));
    const a = buildDaily(pool, 30, now, false)
      .cards.map((c) => c.id)
      .sort();
    const b = buildDaily(pool, 30, now)
      .cards.map((c) => c.id)
      .sort();
    expect(b).toEqual(a);
  });
});
