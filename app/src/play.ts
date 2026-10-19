// 解いている画面（/play）に渡す中身（T025）。URL には載せず、メモリに持つ。
// 再読み込みで消えたら、画面側でホームに戻す
import type { DataSet, Question, SetInfo, Statement } from "./types";
import { EXAM_SHORT, loadSet, merge, uniqueCards } from "./data";
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
  const subjects = new Map(infos.map((i) => [i.subject, i.subject_name]));
  const exams = new Map(infos.map((i) => [i.exam.type, i.exam_name]));
  return (q) => ({
    examName: exams.get(q.exam.type) ?? EXAM_SHORT[q.exam.type] ?? q.exam.type,
    subjectName: subjects.get(q.subject) ?? infos[0].subject_name,
  });
}

/** 出題できる肢。複数の束から出すときは、同じ肢（名寄せ）を1枚にする */
function poolOf(data: DataSet, infos: SetInfo[]): Statement[] {
  const pool = data.statements.filter((s) => s.truth_at_exam && !s.review_flag);
  return infos.length > 1 ? uniqueCards(pool) : pool;
}

function start(s: PlaySession): void {
  current = s;
  navigate({ name: "play" });
}

/** 肢で解く（年度ごと・全年度）。複数年度ならシャッフルする */
export async function startStatements(infos: SetInfo[], title: string, filter: Filter): Promise<void> {
  const data = merge(await Promise.all(infos.map(loadSet)));
  let cards = applyFilter(poolOf(data, infos), filter, getHistory());
  if (infos.length > 1) cards = shuffle(cards);
  start({ kind: "statements", title, data, cards, origin: originOf(infos) });
}

/** 今日の○問（T022）：決まった数を、復習 → まちがえた → 新規 → おさらい の順に選んでシャッフルする */
export async function startDaily(infos: SetInfo[], size: number, title: string): Promise<void> {
  const data = merge(await Promise.all(infos.map(loadSet)));
  const { cards } = buildDaily(poolOf(data, infos), size);
  start({ kind: "statements", title, data, cards, origin: originOf(infos) });
}

/** 今日の復習（FSRS）。新規カードは新しい年度から順に入れる */
export async function startReview(infos: SetInfo[], title: string): Promise<void> {
  const data = merge(await Promise.all(infos.map(loadSet)));
  const { cards } = buildSession(poolOf(data, infos));
  start({ kind: "statements", title, data, cards, origin: originOf(infos) });
}

/** 問で解く（本番形式） */
export async function startQuestions(info: SetInfo): Promise<void> {
  start({ kind: "questions", info, data: await loadSet(info) });
}
