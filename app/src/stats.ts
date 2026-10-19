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

export type HeatCell = { date: string; answered: number; future: boolean };

/** ヒートマップ（GitHub 風）：直近 weeks 週を、日曜始まりの週ごとに7日ずつ。今日より後は future（T034） */
export function heatmapWeeks(daily: Daily, weeks: number, today = new Date()): HeatCell[][] {
  const end = addDays(today, 6 - today.getDay()); // 今週の土曜
  const start = addDays(end, -(weeks * 7 - 1)); // weeks 週前の日曜
  const todayKey = localDate(today);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = localDate(addDays(start, w * 7 + d));
      return { date, answered: daily.get(date)?.answered ?? 0, future: date > todayKey };
    }),
  );
}

/** 色の濃さ（0〜4）。たくさん解いた日ほど濃い */
export function heatLevel(answered: number): number {
  if (answered === 0) return 0;
  if (answered < 10) return 1;
  if (answered < 30) return 2;
  if (answered < 60) return 3;
  return 4;
}

/** 累計の回答数の伸び：最初に解いた日から今日まで、日ごとの累計（T034） */
export function cumulative(daily: Daily, today = new Date()): { date: string; total: number }[] {
  const dates = [...daily.keys()].sort();
  if (dates.length === 0) return [];
  const out: { date: string; total: number }[] = [];
  let total = 0;
  const todayKey = localDate(today);
  for (let d = new Date(dates[0] + "T00:00:00"); localDate(d) <= todayKey; d = addDays(d, 1)) {
    const key = localDate(d);
    total += daily.get(key)?.answered ?? 0;
    out.push({ date: key, total });
  }
  return out;
}
