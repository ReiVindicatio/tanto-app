// 問で解く・模試の経験値（T068）。肢の回答ログには入らないので、ここで数える（端末だけ。同期はしない）
import { getMockHistory } from "./mock";
import { localDate } from "./learning";

const KEY = "tanto.qxp.v1";
/** 問で解くの1問（満点／それ以外）。同じ問は同じ日に1回だけ数える */
export const QUESTION_XP = { full: 3, other: 1 };
/** 模試を1回提出（得点が0より大きいもの。同じ模試は同じ日に1回だけ） */
export const MOCK_XP = 50;

type QRecord = { q: string; day: string; full: boolean };

function questionRecords(): QRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as QRecord[]) : [];
  } catch {
    return [];
  }
}

/** 問で解くで採点したら呼ぶ */
export function addQuestionResult(q: string, full: boolean, now = new Date()): void {
  const day = localDate(now);
  const list = questionRecords();
  if (list.some((r) => r.q === q && r.day === day)) return;
  localStorage.setItem(KEY, JSON.stringify([...list, { q, day, full }]));
}

/** 数に入る模試の提出の回数（節目の衣装の条件にも使う） */
export function mockSubmits(): number {
  const seen = new Set<string>();
  for (const r of getMockHistory()) if (r.earned > 0) seen.add(`${r.key}:${localDate(new Date(r.at))}`);
  return seen.size;
}

export function extraXp(): number {
  return questionRecords().reduce((n, r) => n + (r.full ? QUESTION_XP.full : QUESTION_XP.other), 0) + mockSubmits() * MOCK_XP;
}
