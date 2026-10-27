import { describe, expect, it } from "vitest";
import { levelCost, levelOf, milestones } from "./progress";
import { replay } from "./learning";

describe("継続とレベル（T029）", () => {
  it("経験値（T065）：初めての肢は正解2・不正解1、期限が来た復習は正解3・不正解1、期限の前の解き直しは0", () => {
    const a = (id: string, s: string, at: string, ok: boolean) => ({ id, s, at, ok });
    const x = (log: ReturnType<typeof a>[]) => replay(log).xp;
    expect(x([a("1", "yobi-2026-minpo-q01-a", "2026-10-01T10:00:00Z", true)])).toBe(2);
    expect(x([a("1", "yobi-2026-minpo-q01-a", "2026-10-01T10:00:00Z", false)])).toBe(1);
    // 同じ日に解き直しても増えない
    expect(x([a("1", "yobi-2026-minpo-q01-a", "2026-10-01T10:00:00Z", true), a("2", "yobi-2026-minpo-q01-a", "2026-10-01T10:05:00Z", true)])).toBe(2);
    // 30日後（期限が来ている）に正解すると3、不正解なら1
    expect(x([a("1", "yobi-2026-minpo-q01-a", "2026-10-01T10:00:00Z", true), a("2", "yobi-2026-minpo-q01-a", "2026-10-31T10:00:00Z", true)])).toBe(5);
    expect(x([a("1", "yobi-2026-minpo-q01-a", "2026-10-01T10:00:00Z", true), a("2", "yobi-2026-minpo-q01-a", "2026-10-31T10:00:00Z", false)])).toBe(3);
    // 不正解の翌日は期限が来ている
    expect(x([a("1", "yobi-2026-minpo-q01-a", "2026-10-01T10:00:00Z", false), a("2", "yobi-2026-minpo-q01-a", "2026-10-02T10:00:00Z", true)])).toBe(4);
  });

  it("レベルは上がるほど次までが長い（Lv1→2 は20、Lv2→3 は30）", () => {
    expect(levelCost(1)).toBe(20);
    expect(levelCost(2)).toBe(30);
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 20 });
    expect(levelOf(19)).toEqual({ level: 1, into: 19, need: 20 });
    expect(levelOf(20)).toEqual({ level: 2, into: 0, need: 30 });
    expect(levelOf(55)).toEqual({ level: 3, into: 5, need: 40 });
  });

  it("答える前と後で、レベルアップと目標の達成を見つける（目標は届いたときの1回だけ）", () => {
    const p = (level: number, today: number) => ({ streak: 1, xp: 0, level, into: 0, need: 20, today, goal: 10 });
    expect(milestones(p(1, 9), p(2, 10))).toEqual({ levelUp: 2, goalReached: true });
    expect(milestones(p(2, 10), p(2, 11))).toEqual({ levelUp: null, goalReached: false });
  });
});
