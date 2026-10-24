// 今日の○問（T022）。決まった数の肢を、復習 → まちがえた → 新規 → おさらい の順に選ぶ。
// カードの状態・履歴は回答ログから作った状態（learning.ts）を読むだけ。FSRS という言葉は画面に出さない
import { currentState, localDate, subjectOf } from "./learning";
import { shuffle } from "./shuffle";

export type DailyKind = "due" | "wrong" | "fresh" | "again";
/** エンドレス（終わるまで続ける）を表す問題数 */
export const ENDLESS = 0;
export const DAILY_SIZES = [10, 20, 30, 50, ENDLESS] as const;
/** エンドレスで一度に選ぶ数（残りが少なくなったら、同じ選び方で次を足す） */
export const ENDLESS_BATCH = 20;
export const DAILY_DEFAULT = 30;

type Item = { id: string; question_id: string };

/** 科目ごとの並び（各科目の中は渡された順）を、科目を交互にして1列にする */
function interleaveBySubject<T extends Item>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const c of items) {
    const k = subjectOf(c.id);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const lists = [...groups.values()];
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

/**
 * 今日の○問の中身を選ぶ。pool は対象の肢（各科目の中は新しい年度が先）。
 * 同じ問の肢は1回に1枚まで。最後にシャッフルする（shuffled=false で選んだ順のまま返す：テスト用）
 */
export function buildDaily<T extends Item>(
  pool: T[],
  size: number,
  now = new Date(),
  shuffled = true,
): { cards: T[]; counts: Record<DailyKind, number> } {
  const { cards: cardState, history } = currentState();
  const answered = (c: T) => history.has(c.id);
  // 今日答えた肢は、まちがえた・おさらいの枠でも今日はもう出さない（不正解は翌日の復習で出る。T037）
  const today = localDate(now);
  const notToday = (c: T) => localDate(new Date(history.get(c.id)!.at)) !== today;
  const due = pool
    .filter((c) => cardState.has(c.id) && cardState.get(c.id)!.due <= now)
    .sort((a, b) => cardState.get(a.id)!.due.getTime() - cardState.get(b.id)!.due.getTime());
  const dueIds = new Set(due.map((c) => c.id));
  const wrong = pool
    .filter((c) => answered(c) && !history.get(c.id)!.last && !dueIds.has(c.id) && notToday(c))
    .sort((a, b) => history.get(b.id)!.at.localeCompare(history.get(a.id)!.at));
  const fresh = interleaveBySubject(pool.filter((c) => !answered(c)));
  const again = pool
    .filter((c) => answered(c) && history.get(c.id)!.last && !dueIds.has(c.id) && notToday(c))
    .sort((a, b) => history.get(a.id)!.at.localeCompare(history.get(b.id)!.at));

  const chosen: T[] = [];
  const counts: Record<DailyKind, number> = { due: 0, wrong: 0, fresh: 0, again: 0 };
  const usedQuestions = new Set<string>();
  const lists: [DailyKind, T[]][] = [
    ["due", due],
    ["wrong", wrong],
    ["fresh", fresh],
    ["again", again],
  ];
  for (const [kind, list] of lists) {
    for (const c of list) {
      if (chosen.length >= size) break;
      if (usedQuestions.has(c.question_id)) continue;
      usedQuestions.add(c.question_id);
      chosen.push(c);
      counts[kind]++;
    }
  }
  return { cards: shuffled ? shuffle(chosen) : chosen, counts };
}

/** 内訳の表示（例：「復習 12・まちがえた 3・新規 15」）。0 の種類は出さない */
export function describeCounts(counts: Record<DailyKind, number>): string {
  const labels: [DailyKind, string][] = [
    ["due", "復習"],
    ["wrong", "まちがえた"],
    ["fresh", "新規"],
    ["again", "おさらい"],
  ];
  return labels
    .filter(([k]) => counts[k] > 0)
    .map(([k, l]) => `${l} ${counts[k]}`)
    .join("・");
}

// ---- 選んだ問題数・範囲（変えたときだけ端末に保存） ----

const PREFS = "tanto.prefs.v1";
export type DailyPrefs = { size: number; subject: string | null };

export function getDailyPrefs(): DailyPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? "{}") as Partial<DailyPrefs>;
    return {
      size: DAILY_SIZES.includes(p.size as (typeof DAILY_SIZES)[number]) ? (p.size as number) : DAILY_DEFAULT,
      subject: typeof p.subject === "string" ? p.subject : null,
    };
  } catch {
    return { size: DAILY_DEFAULT, subject: null };
  }
}

export function setDailyPrefs(p: DailyPrefs): void {
  localStorage.setItem(PREFS, JSON.stringify(p));
}
