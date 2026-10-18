// テスト用の小道具
import type { Question, Statement } from "../types";
import type { Answer, RecordStore } from "../store";

/** localStorage の代わり（Storage インタフェースの最小実装） */
export class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}

/** 保存先の代わり（メモリ上の配列） */
export class MemoryStore implements RecordStore {
  constructor(public log: Answer[] = []) {}
  async load() {
    return [...this.log];
  }
  async append(a: Answer) {
    this.log.push(a);
  }
}

let n = 0;
export function ans(s: string, ok: boolean, at: string, id = `a${++n}`): Answer {
  return { id, s, ok, at };
}

export function question(over: Partial<Question>): Question {
  return {
    id: "yobi-2026-minpo-q01",
    exam: { type: "yobi", year: 2026, era: "R08" },
    subject: "minpo",
    number: 1,
    points: 2,
    format: "combination",
    polarity: "correct",
    exhaustive: false,
    unordered: false,
    stem: "",
    context: [],
    sub_questions: [],
    requires_context: false,
    choices: [1, 2, 3, 4, 5].map((k) => ({ number: k, text: "" })),
    answer_slots: [{ no: 1, official_answer: 3 }],
    scoring: { partial_credit: null, no_partial_credit: false, raw_note: "" },
    statements: [],
    statement_truth_derivable: true,
    ...over,
  };
}

export function statement(id: string, over: Partial<Statement> = {}): Statement {
  return { id, question_id: id.replace(/-[^-]+$/, ""), label: "ア", text: "", requires_context: false, truth_at_exam: null, ...over };
}
