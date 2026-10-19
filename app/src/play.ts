// 解いている画面（/play）に渡す中身（T025）。URL には載せず、メモリに持つ。
// 再読み込みで消えたら、画面側でホームに戻す
import type { DataSet, Question, SetInfo, Statement } from "./types";
import { loadSet, merge } from "./data";
import { applyFilter, getHistory, type Filter } from "./history";
import { shuffle } from "./shuffle";
import { buildSession } from "./srs";
import { buildDaily } from "./daily";
import { navigate } from "./router";

/** 問の出典の名前（試験名・科目名）。今日の○問では科目がまざるので、問ごとに引く */
export type OriginOf = (q: Question) => { examName: string; subjectName: string };

export type PlaySession =
  | { kind: "statements"; title: string; data: DataSet; cards: Statement[]; origin: OriginOf }
  | { kind: "questions"; info: SetInfo; data: DataSet };

let current: PlaySession | null = null;

export function currentPlay(): PlaySession | null {
  return current;
}

function originOf(infos: SetInfo[]): OriginOf {
  const bySubject = new Map(infos.map((i) => [i.subject, { examName: i.exam_name, subjectName: i.subject_name }]));
  return (q) => bySubject.get(q.subject) ?? { examName: infos[0].exam_name, subjectName: infos[0].subject_name };
}

function start(s: PlaySession): void {
  current = s;
  navigate({ name: "play" });
}

/** 肢で解く（年度ごと・全年度）。複数年度ならシャッフルする */
export async function startStatements(infos: SetInfo[], title: string, filter: Filter): Promise<void> {
  const data = merge(await Promise.all(infos.map(loadSet)));
  let cards = data.statements.filter((s) => s.truth_at_exam && !s.review_flag);
  cards = applyFilter(cards, filter, getHistory());
  if (infos.length > 1) cards = shuffle(cards);
  start({ kind: "statements", title, data, cards, origin: originOf(infos) });
}

/** 今日の○問（T022）：決まった数を、復習 → まちがえた → 新規 → おさらい の順に選んでシャッフルする */
export async function startDaily(infos: SetInfo[], size: number, title: string): Promise<void> {
  const data = merge(await Promise.all(infos.map(loadSet)));
  const pool = data.statements.filter((s) => s.truth_at_exam && !s.review_flag);
  const { cards } = buildDaily(pool, size);
  start({ kind: "statements", title, data, cards, origin: originOf(infos) });
}

/** 今日の復習（FSRS）。新規カードは新しい年度から順に入れる */
export async function startReview(infos: SetInfo[], title: string): Promise<void> {
  const data = merge(await Promise.all(infos.map(loadSet)));
  const pool = data.statements.filter((s) => s.truth_at_exam && !s.review_flag);
  const { cards } = buildSession(pool);
  start({ kind: "statements", title, data, cards, origin: originOf(infos) });
}

/** 問で解く（本番形式） */
export async function startQuestions(info: SetInfo): Promise<void> {
  start({ kind: "questions", info, data: await loadSet(info) });
}
