import { describe, expect, it } from "vitest";
import { lastDays, streak, totals, type Daily } from "./stats";

const today = new Date(2026, 9, 19, 12); // 2026-10-19（端末の現地時刻）
const daily = (days: string[]): Daily => new Map(days.map((d) => [d, { answered: 3, correct: 2 }]));

describe("stats（T024）", () => {
  it("連続学習日数：今日を含めて数え、途切れたら止まる", () => {
    expect(streak(daily(["2026-10-19", "2026-10-18", "2026-10-17", "2026-10-15"]), today)).toBe(3);
  });

  it("連続学習日数：今日まだでも昨日まで続いていれば数える。昨日もなければ0", () => {
    expect(streak(daily(["2026-10-18", "2026-10-17"]), today)).toBe(2);
    expect(streak(daily(["2026-10-17"]), today)).toBe(0);
  });

  it("直近の日々は古い順で、解いていない日は0", () => {
    const r = lastDays(daily(["2026-10-19", "2026-10-17"]), 3, today);
    expect(r).toEqual([
      { date: "2026-10-17", answered: 3, correct: 2 },
      { date: "2026-10-18", answered: 0, correct: 0 },
      { date: "2026-10-19", answered: 3, correct: 2 },
    ]);
  });

  it("累計", () => {
    expect(totals(daily(["2026-10-19", "2026-10-17"]))).toEqual({ days: 2, answered: 6, correct: 4 });
  });
});
