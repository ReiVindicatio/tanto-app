import { describe, expect, it } from "vitest";
import { levelCost, levelOf, milestones, xpOf } from "./progress";

describe("継続とレベル（T029）", () => {
  it("経験値は答えた数＋正解の数", () => {
    expect(xpOf(new Map([["2026-10-24", { answered: 10, correct: 7 }], ["2026-10-25", { answered: 5, correct: 5 }]]))).toBe(27);
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
