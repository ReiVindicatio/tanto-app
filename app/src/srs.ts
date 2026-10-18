// FSRS（間隔反復）の出題。カードの状態は回答ログから作った状態（learning.ts）を読むだけ
// 評価は○×の正誤で決める：不正解＝Again、正解＝Good（設計 §3.7）。新規の枠は科目ごとに1日20枚
import { currentState, localDate, subjectOf } from "./learning";

export const NEW_PER_DAY = 20;

function newCountToday(now: Date, subject: string): number {
  return currentState().newCount.get(`${subject}:${localDate(now)}`) ?? 0;
}

type Item = { id: string; question_id: string };

/**
 * 今日の復習の出題順を作る。期限が来たカード（期限の古い順）→ 新規カード（今日の残り枠まで）。
 * 同じ問の肢は1回のセッションで1枚まで（兄弟の抑制）。
 */
export function buildSession<T extends Item>(pool: T[], now = new Date()): { cards: T[]; due: number; fresh: number } {
  const cardsState = currentState().cards;
  const usedQuestions = new Set<string>();
  const due = pool
    .filter((c) => cardsState.has(c.id) && cardsState.get(c.id)!.due <= now)
    .sort((a, b) => cardsState.get(a.id)!.due.getTime() - cardsState.get(b.id)!.due.getTime());
  const cards: T[] = [];
  for (const c of due) {
    if (usedQuestions.has(c.question_id)) continue;
    usedQuestions.add(c.question_id);
    cards.push(c);
  }
  const dueCount = cards.length;
  let room = Math.max(0, NEW_PER_DAY - newCountToday(now, pool[0] ? subjectOf(pool[0].id) : ""));
  for (const c of pool) {
    if (room === 0) break;
    if (cardsState.has(c.id) || usedQuestions.has(c.question_id)) continue;
    usedQuestions.add(c.question_id);
    cards.push(c);
    room--;
  }
  return { cards, due: dueCount, fresh: cards.length - dueCount };
}

/** ホームの表示用：期限が来ているカードの数と、今日の新規の残り枠 */
export function dueSummary(pool: Item[], now = new Date()): { due: number; newLeft: number } {
  const cardsState = currentState().cards;
  const due = pool.filter((c) => cardsState.has(c.id) && cardsState.get(c.id)!.due <= now).length;
  return { due, newLeft: Math.max(0, NEW_PER_DAY - newCountToday(now, pool[0] ? subjectOf(pool[0].id) : "")) };
}
