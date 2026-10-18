// FSRS（間隔反復）。肢 ID ごとのカードを端末内（localStorage）に保存する
// 評価は○×の正誤で決める：不正解＝Again、正解＝Good（設計 §3.7）
import { createEmptyCard, fsrs, Rating, type Card } from "ts-fsrs";

const KEY = "tanto.srs.v1";
const NEW_KEY = "tanto.srs.new.v2"; // { "<科目>:YYYY-MM-DD": 今日導入した新規カードの数 }（新規の枠は科目ごと）
export const NEW_PER_DAY = 20;

const scheduler = fsrs();

type Stored = Omit<Card, "due" | "last_review"> & { due: string; last_review?: string };

function loadAll(): { [id: string]: Stored } {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function toCard(s: Stored): Card {
  return { ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined };
}

/** 端末の現地時刻での日付（YYYY-MM-DD）。UTC だと日本時間の朝9時に日付が変わってしまう */
function today(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 肢 ID（yobi-2026-minpo-q01-a）から科目を取り出す */
function subjectOf(statementId: string): string {
  return statementId.split("-")[2] ?? "";
}

function newCountToday(now: Date, subject: string): number {
  try {
    return (JSON.parse(localStorage.getItem(NEW_KEY) ?? "{}") as Record<string, number>)[`${subject}:${today(now)}`] ?? 0;
  } catch {
    return 0;
  }
}

/** 回答を FSRS に反映する。どのモードで答えても呼ぶ */
export function review(statementId: string, isCorrect: boolean, now = new Date()): void {
  const all = loadAll();
  const isNew = !all[statementId];
  const card = isNew ? createEmptyCard(now) : toCard(all[statementId]);
  const { card: next } = scheduler.next(card, now, isCorrect ? Rating.Good : Rating.Again);
  all[statementId] = { ...next, due: next.due.toISOString(), last_review: next.last_review?.toISOString() };
  localStorage.setItem(KEY, JSON.stringify(all));
  if (isNew) {
    const counts = JSON.parse(localStorage.getItem(NEW_KEY) ?? "{}") as Record<string, number>;
    const k = `${subjectOf(statementId)}:${today(now)}`;
    counts[k] = (counts[k] ?? 0) + 1;
    localStorage.setItem(NEW_KEY, JSON.stringify(counts));
  }
}

type Item = { id: string; question_id: string };

/**
 * 今日の復習の出題順を作る。期限が来たカード（期限の古い順）→ 新規カード（今日の残り枠まで）。
 * 同じ問の肢は1回のセッションで1枚まで（兄弟の抑制）。
 */
export function buildSession<T extends Item>(pool: T[], now = new Date()): { cards: T[]; due: number; fresh: number } {
  const all = loadAll();
  const usedQuestions = new Set<string>();
  const due = pool
    .filter((c) => all[c.id] && new Date(all[c.id].due) <= now)
    .sort((a, b) => all[a.id].due.localeCompare(all[b.id].due));
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
    if (all[c.id] || usedQuestions.has(c.question_id)) continue;
    usedQuestions.add(c.question_id);
    cards.push(c);
    room--;
  }
  return { cards, due: dueCount, fresh: cards.length - dueCount };
}

/** ホームの表示用：期限が来ているカードの数と、今日の新規の残り枠 */
export function dueSummary(pool: Item[], now = new Date()): { due: number; newLeft: number } {
  const all = loadAll();
  const due = pool.filter((c) => all[c.id] && new Date(all[c.id].due) <= now).length;
  return { due, newLeft: Math.max(0, NEW_PER_DAY - newCountToday(now, pool[0] ? subjectOf(pool[0].id) : "")) };
}
