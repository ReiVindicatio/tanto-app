import { describe, expect, it } from "vitest";
import { byWeakness, isWeak, refOf, setIdOf, topicStats, type Topic } from "./topics";
import type { HistoryRecord } from "./learning";

const rec = (last: boolean): HistoryRecord => ({ attempts: 1, correct: last ? 1 : 0, last, at: "2026-10-22T00:00:00.000Z" });
const topic = (label: string, ids: string[]): Topic => ({ label, cards: ids.map(refOf) });

describe("分野（T016）", () => {
  it("肢 ID から問 ID・束の ID を作る（小問の肢も）", () => {
    expect(refOf("yobi-2026-minpo-q01-a")).toEqual({ id: "yobi-2026-minpo-q01-a", question_id: "yobi-2026-minpo-q01" });
    expect(refOf("shiho-2024-keiso-q22-2-b").question_id).toBe("shiho-2024-keiso-q22");
    expect(setIdOf("shiho-2024-keiso-q22-2-b")).toBe("shiho-2024-keiso");
  });

  it("前回正解の割合で数え、回答済みが5枚以上で6割未満なら苦手", () => {
    const ids = ["a", "b", "c", "d", "e", "f"].map((x) => `yobi-2026-minpo-q01-${x}`);
    const t = topic("第一編 総則 › 第五章 法律行為", ids);
    const store = new Map(ids.slice(0, 5).map((id, i) => [id, rec(i < 2)])); // 5枚回答・2枚正解
    const s = topicStats(t, store);
    expect(s).toEqual({ cards: 6, answered: 5, lastCorrect: 2, rate: 0.4 });
    expect(isWeak(s)).toBe(true);
    expect(isWeak(topicStats(t, new Map(ids.slice(0, 4).map((id) => [id, rec(false)]))))).toBe(false); // 4枚ではまだ決めない
  });

  it("苦手な順：割合の低い順。判断できない分野は後ろで、元の順を保つ", () => {
    const a = topic("A", ["yobi-2026-minpo-q01-a"]);
    const b = topic("B", ["yobi-2026-minpo-q02-a"]);
    const c = topic("C", ["yobi-2026-minpo-q03-a"]);
    const stats = new Map([
      ["A", { cards: 9, answered: 0, lastCorrect: 0, rate: null }],
      ["B", { cards: 9, answered: 6, lastCorrect: 5, rate: 5 / 6 }],
      ["C", { cards: 9, answered: 6, lastCorrect: 1, rate: 1 / 6 }],
    ]);
    expect(byWeakness([a, b, c], stats).map((t) => t.label)).toEqual(["C", "B", "A"]);
  });
});
