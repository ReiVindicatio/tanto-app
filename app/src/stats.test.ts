import { describe, expect, it } from "vitest";
import { cumulative, heatLevel, heatmapWeeks, streak, totals, type Daily } from "./stats";

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

  it("ヒートマップ：日曜始まりの週で、最後の週に今日が入り、今日より後は future", () => {
    const weeks = heatmapWeeks(daily(["2026-10-19", "2026-10-05"]), 3, today); // 2026-10-19 は月曜
    expect(weeks).toHaveLength(3);
    expect(weeks[0][0].date).toBe("2026-10-04"); // 3週前の日曜
    expect(weeks[2][1]).toEqual({ date: "2026-10-19", answered: 3, future: false });
    expect(weeks[2][2].future).toBe(true);
    expect(weeks[0][1].answered).toBe(3); // 10/05
  });

  it("色の濃さは回答数で決まる", () => {
    expect([0, 1, 10, 30, 60].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
  });

  it("累計の伸び：最初に解いた日から今日まで、解いていない日も含めて累計する", () => {
    const r = cumulative(daily(["2026-10-17", "2026-10-19"]), today);
    expect(r).toEqual([
      { date: "2026-10-17", total: 3 },
      { date: "2026-10-18", total: 3 },
      { date: "2026-10-19", total: 6 },
    ]);
    expect(cumulative(new Map(), today)).toEqual([]);
  });

  it("累計", () => {
    expect(totals(daily(["2026-10-19", "2026-10-17"]))).toEqual({ days: 2, answered: 6, correct: 4 });
  });
});
