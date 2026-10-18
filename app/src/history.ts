// 正答履歴の集計と絞り込み。中身は回答ログから作った状態（learning.ts）を読むだけ
import { currentState, type HistoryRecord } from "./learning";

export type { HistoryRecord as Record };
type Store = Map<string, HistoryRecord>;

export function getHistory(): Store {
  return currentState().history;
}

export type Filter = "all" | "unanswered" | "wrong";

export function applyFilter<T extends { id: string }>(cards: T[], filter: Filter, store: Store = getHistory()): T[] {
  if (filter === "unanswered") return cards.filter((c) => !store.has(c.id));
  if (filter === "wrong") return cards.filter((c) => store.has(c.id) && !store.get(c.id)!.last);
  return cards;
}

export function summarize(ids: string[], store: Store = getHistory()): { answered: number; lastCorrect: number } {
  let answered = 0;
  let lastCorrect = 0;
  for (const id of ids) {
    const r = store.get(id);
    if (!r) continue;
    answered++;
    if (r.last) lastCorrect++;
  }
  return { answered, lastCorrect };
}
