import { describe, expect, it } from "vitest";
import { initLearning } from "./learning";
import { buildSession, dueSummary, NEW_PER_DAY } from "./srs";
import { ans, MemoryStore } from "./test/fakes";

const item = (q: number, l: string) => ({ id: `yobi-2026-minpo-q${String(q).padStart(2, "0")}-${l}`, question_id: `yobi-2026-minpo-q${String(q).padStart(2, "0")}` });

describe("buildSession", () => {
  it("新規は1日20枚まで、同じ問の肢は1枚まで", async () => {
    await initLearning(new MemoryStore());
    const pool = Array.from({ length: 30 }, (_, q) => ["a", "b", "c"].map((l) => item(q + 1, l))).flat();
    const { cards, due, fresh } = buildSession(pool, new Date("2026-10-10T00:00:00.000Z"));
    expect(due).toBe(0);
    expect(fresh).toBe(NEW_PER_DAY);
    expect(new Set(cards.map((c) => c.question_id)).size).toBe(cards.length);
  });

  it("期限の来たカードを期限の古い順に先に出し、今日導入した新規の分だけ枠が減る", async () => {
    const now = new Date("2026-12-01T12:00:00.000Z");
    const today = now.toISOString();
    await initLearning(
      new MemoryStore([
        ans(item(1, "a").id, false, "2026-10-01T00:00:00.000Z"),
        ans(item(2, "a").id, false, "2026-09-01T00:00:00.000Z"),
        ans(item(3, "a").id, true, today), // 今日の新規（期限はまだ）
      ]),
    );
    const pool = [item(1, "a"), item(1, "b"), item(2, "a"), item(3, "a"), item(4, "a")];
    const s = buildSession(pool, now);
    expect(s.cards.slice(0, 2).map((c) => c.id)).toEqual([item(2, "a").id, item(1, "a").id]);
    expect(s.cards.map((c) => c.id)).not.toContain(item(1, "b").id); // 問1は期限切れの肢で使用済み
    expect(s.cards.map((c) => c.id)).toContain(item(4, "a").id);
    expect(dueSummary(pool, now)).toEqual({ due: 2, newLeft: NEW_PER_DAY - 1 });
  });
});
