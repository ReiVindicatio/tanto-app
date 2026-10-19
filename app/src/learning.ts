// 回答ログから、正答履歴の集計・FSRS のカードの状態・今日の新規の数を作る（T020）。
// 保存先（store.ts）を知らない。replay と apply は純粋な処理なので、単体テストの対象にする（T001）。
import { createEmptyCard, fsrs, Rating, type Card } from "ts-fsrs";
import { newAnswerId, type Answer, type RecordStore } from "./store";

export type HistoryRecord = { attempts: number; correct: number; last: boolean; at: string };

export type LearningState = {
  history: Map<string, HistoryRecord>;
  cards: Map<string, Card>;
  /** "<科目>:YYYY-MM-DD"（端末の現地日付）→ その日に初めて答えた肢の数 */
  newCount: Map<string, number>;
  /** "YYYY-MM-DD"（端末の現地日付）→ その日の回答数・正解数（T025：今日の成績） */
  daily: Map<string, { answered: number; correct: number }>;
};

const scheduler = fsrs();

export function emptyState(): LearningState {
  return { history: new Map(), cards: new Map(), newCount: new Map(), daily: new Map() };
}

/** 肢 ID（yobi-2026-minpo-q01-a）から科目を取り出す */
export function subjectOf(statementId: string): string {
  return statementId.split("-")[2] ?? "";
}

/** 端末の現地時刻での日付（YYYY-MM-DD） */
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 回答1件を状態に反映する（state を書き換える） */
export function apply(state: LearningState, a: Answer): void {
  const at = new Date(a.at);
  const prev = state.history.get(a.s);
  if (!prev) {
    const k = `${subjectOf(a.s)}:${localDate(at)}`;
    state.newCount.set(k, (state.newCount.get(k) ?? 0) + 1);
  }
  const day = localDate(at);
  const d = state.daily.get(day) ?? { answered: 0, correct: 0 };
  state.daily.set(day, { answered: d.answered + 1, correct: d.correct + (a.ok ? 1 : 0) });
  state.history.set(a.s, {
    attempts: (prev?.attempts ?? 0) + 1,
    correct: (prev?.correct ?? 0) + (a.ok ? 1 : 0),
    last: a.ok,
    at: a.at,
  });
  const card: Card = state.cards.get(a.s) ?? createEmptyCard<Card>(at);
  state.cards.set(a.s, scheduler.next(card, at, a.ok ? Rating.Good : Rating.Again).card);
}

/** 回答ログを古い順に流し直して状態を作る */
export function replay(log: Answer[]): LearningState {
  const state = emptyState();
  const seen = new Set<string>();
  const sorted = [...log].sort((x, y) => x.at.localeCompare(y.at));
  for (const a of sorted) {
    if (seen.has(a.id)) continue; // 同じ回答の重複（同期で起きうる）は1回だけ数える
    seen.add(a.id);
    apply(state, a);
  }
  return state;
}

// ---- アプリ全体で1つの状態（起動時に init で読み込む） ----

let store: RecordStore | null = null;
let state: LearningState = emptyState();
const listeners = new Set<() => void>();

export async function initLearning(s: RecordStore): Promise<void> {
  store = s;
  state = replay(await s.load());
}

/** 保存先から読み直して状態を作り直す（同期でサーバーから回答を受け取ったとき・ログアウトのとき。T003） */
export async function reloadLearning(): Promise<void> {
  if (!store) return;
  state = replay(await store.load());
  listeners.forEach((cb) => cb());
}

/** 学習の状態が変わったら呼ぶ（画面の再描画用）。登録を解く関数を返す */
export function onLearningChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function currentState(): LearningState {
  return state;
}

/** 回答を記録する。メモリ上の状態をすぐ更新し、保存先へ追記する */
export function recordAnswer(statementId: string, isCorrect: boolean, now = new Date()): void {
  const a: Answer = { id: newAnswerId(), s: statementId, ok: isCorrect, at: now.toISOString() };
  apply(state, a);
  listeners.forEach((cb) => cb());
  store?.append(a).catch((e) => console.error("回答を保存できませんでした", e));
}
