import { describe, expect, it } from "vitest";
import { trapDeck, trapOf, trapStats, type TrapsDoc } from "./traps";
import type { HistoryRecord } from "./learning";

const T: TrapsDoc = {
  types: { add_requirement: { name: "要件の付け足し", desc: "d1" }, exception: { name: "ただし書・例外の見落とし", desc: "d2" } },
  items: Object.fromEntries([
    ...[1, 2, 3, 4, 5, 6].map((n) => [`yobi-2026-minpo-q0${n}-a`, ["add_requirement", "w"]]),
    ...[1, 2, 3, 4, 5].map((n) => [`yobi-2026-keiho-q0${n}-a`, ["exception", "w"]]),
  ]) as TrapsDoc["items"],
};
const rec = (last: boolean): HistoryRecord => ({ attempts: 1, correct: last ? 1 : 0, last, at: "2026-10-25T00:00:00Z" });

describe("ひっかけの型（T059）", () => {
  it("肢の型と理由を引ける。型のない肢は null", () => {
    expect(trapOf(T, "yobi-2026-minpo-q01-a")).toMatchObject({ type: "add_requirement", name: "要件の付け足し", why: "w" });
    expect(trapOf(T, "yobi-2026-minpo-q01-b")).toBeNull();
  });

  it("まちがえやすい型：答えた×の肢が5枚以上の型だけ、ひっかかった割合の高い順", () => {
    const h = new Map<string, HistoryRecord>([
      ["yobi-2026-minpo-q01-a", rec(false)],
      ["yobi-2026-minpo-q02-a", rec(true)],
      ["yobi-2026-minpo-q03-a", rec(true)],
      ["yobi-2026-minpo-q04-a", rec(true)],
      ["yobi-2026-minpo-q05-a", rec(true)],
      ["yobi-2026-keiho-q01-a", rec(false)],
      ["yobi-2026-keiho-q02-a", rec(false)],
      ["yobi-2026-keiho-q03-a", rec(true)],
      ["yobi-2026-keiho-q04-a", rec(true)],
      ["yobi-2026-keiho-q05-a", rec(true)],
    ]);
    const s = trapStats(T, h);
    expect(s.map((x) => [x.type, x.fell, x.answered])).toEqual([
      ["exception", 2, 5],
      ["add_requirement", 1, 5],
    ]);
    expect(trapStats(T, new Map([["yobi-2026-minpo-q01-a", rec(false)]]))).toEqual([]);
  });

  it("型ごとに解く：その型の×の肢に、同じ科目のほかの肢を同じ数だけ混ぜる。前回まちがえた肢を先に入れる", () => {
    const pool = [
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `yobi-2026-minpo-q0${n}-a`, question_id: `yobi-2026-minpo-q0${n}` })),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `yobi-2026-minpo-q0${n}-b`, question_id: `yobi-2026-minpo-q0${n}` })),
      { id: "yobi-2026-keiho-q09-b", question_id: "yobi-2026-keiho-q09" },
    ];
    const deck = trapDeck(T, "add_requirement", pool, new Map([["yobi-2026-minpo-q06-a", rec(false)]]));
    const ids = deck.map((c) => c.id);
    expect(ids.filter((id) => id.endsWith("-a"))).toHaveLength(6);
    expect(ids.filter((id) => id.endsWith("-b"))).toHaveLength(6);
    expect(ids).not.toContain("yobi-2026-keiho-q09-b"); // ほかの科目は混ぜない
  });
});
