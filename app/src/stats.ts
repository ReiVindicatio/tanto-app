// マイページの集計（T024）。回答ログから作った状態（learning.ts）を読むだけ
import { localDate } from "./learning";

export type Daily = Map<string, { answered: number; correct: number }>;

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 連続学習日数。今日まだ解いていなくても、昨日まで続いていれば数える（今日のうちに解けば続く） */
export function streak(daily: Daily, today = new Date()): number {
  let d = daily.has(localDate(today)) ? today : addDays(today, -1);
  let n = 0;
  while (daily.has(localDate(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** 直近 n 日（古い順。今日が最後） */
export function lastDays(daily: Daily, n: number, today = new Date()): { date: string; answered: number; correct: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const date = localDate(addDays(today, i - (n - 1)));
    const v = daily.get(date) ?? { answered: 0, correct: 0 };
    return { date, ...v };
  });
}

/** 学習した日数と累計 */
export function totals(daily: Daily): { days: number; answered: number; correct: number } {
  let answered = 0;
  let correct = 0;
  for (const v of daily.values()) {
    answered += v.answered;
    correct += v.correct;
  }
  return { days: daily.size, answered, correct };
}
