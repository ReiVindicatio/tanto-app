// 正答履歴。端末内（localStorage）にだけ保存する。サーバーには送らない
// 肢カードの回答を肢 ID ごとに記録する（FSRS を入れるときの土台）

export type Record = { attempts: number; correct: number; last: boolean; at: string };
type Store = { [statementId: string]: Record };

const KEY = "tanto.history.v1";

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

export function getHistory(): Store {
  return load();
}

export function recordAnswer(statementId: string, isCorrect: boolean): void {
  const store = load();
  const prev = store[statementId] ?? { attempts: 0, correct: 0, last: false, at: "" };
  store[statementId] = {
    attempts: prev.attempts + 1,
    correct: prev.correct + (isCorrect ? 1 : 0),
    last: isCorrect,
    at: new Date().toISOString(),
  };
  localStorage.setItem(KEY, JSON.stringify(store));
}

export type Filter = "all" | "unanswered" | "wrong";

export function applyFilter<T extends { id: string }>(cards: T[], filter: Filter, store: Store = load()): T[] {
  if (filter === "unanswered") return cards.filter((c) => !store[c.id]);
  if (filter === "wrong") return cards.filter((c) => store[c.id] && !store[c.id].last);
  return cards;
}

export function summarize(ids: string[], store: Store = load()): { answered: number; lastCorrect: number } {
  let answered = 0;
  let lastCorrect = 0;
  for (const id of ids) {
    const r = store[id];
    if (!r) continue;
    answered++;
    if (r.last) lastCorrect++;
  }
  return { answered, lastCorrect };
}
