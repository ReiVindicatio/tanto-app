// 継続とレベル（T029）：連続日数・1日の目標・レベル。どれも回答ログから作った状態（learning.ts）から計算する。経験値の数え方は learning.ts の xpGain（T065）
import { currentState, localDate } from "./learning";
import { streak } from "./stats";

/** Lv.L から L+1 に上がるのに要る経験値（上がるほど長くなる） */
export function levelCost(level: number): number {
  return 20 + 10 * (level - 1);
}

/** 経験値からレベルと、次のレベルまでの進み具合 */
export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = xp;
  while (rest >= levelCost(level)) {
    rest -= levelCost(level);
    level++;
  }
  return { level, into: rest, need: levelCost(level) };
}

export const GOALS = [10, 20, 30, 50] as const;
export const GOAL_DEFAULT = 20;
const KEY = "tanto.goal.v1";

export function getGoal(): number {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}").daily;
    return GOALS.includes(v) ? v : GOAL_DEFAULT;
  } catch {
    return GOAL_DEFAULT;
  }
}

export function setGoal(n: number): void {
  localStorage.setItem(KEY, JSON.stringify({ daily: n }));
}

export type Progress = { streak: number; xp: number; level: number; into: number; need: number; today: number; goal: number };

/** いまの連続日数・レベル・今日の回答数 */
export function progressNow(now = new Date()): Progress {
  const { daily, xp } = currentState();
  return { streak: streak(daily, now), xp, ...levelOf(xp), today: daily.get(localDate(now))?.answered ?? 0, goal: getGoal() };
}

/** 答える前と後を比べて、レベルが上がったか・今日の目標に届いたか */
export function milestones(before: Progress, after: Progress): { levelUp: number | null; goalReached: boolean } {
  return {
    levelUp: after.level > before.level ? after.level : null,
    goalReached: before.today < before.goal && after.today >= after.goal,
  };
}
