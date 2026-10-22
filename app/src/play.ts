// 解いている画面（/play）に渡す中身（T025）。URL には載せず、メモリに持つ。
// 再読み込みで消えたら、画面側でホームに戻す
import type { DataSet, Question, SetInfo, Statement } from "./types";
import { EXAM_SHORT, cardRefsOf, loadSet, merge, uniqueCards, type CardRef } from "./data";
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

/** 範囲の肢カード（index.json の一覧から。T038）。複数の束から出すときは、同じ肢（名寄せ）を1枚にする */
function refPool(infos: SetInfo[]): CardRef[] {
  const refs = infos.flatMap(cardRefsOf);
  return infos.length > 1 ? uniqueCards(refs) : refs;
}

/** 選んだ肢を含む束だけ読み、選んだ順の肢にする（T038：範囲の全部の束は読まない） */
async function loadChosen(infos: SetInfo[], chosen: CardRef[]): Promise<{ data: DataSet; cards: Statement[] }> {
  const need = new Set(chosen.map((c) => c.question_id.replace(/-q\d+$/, "")));
  const sets = infos.filter((i) => need.has(i.id));
  const data = merge(await Promise.all((sets.length ? sets : infos.slice(0, 1)).map(loadSet)));
  const byId = new Map(data.statements.map((s) => [s.id, s]));
  return { data, cards: chosen.map((c) => byId.get(c.id)).filter((s): s is Statement => s !== undefined) };
}

/** 端末に古い index.json が残っていて、肢カードの一覧がないとき */
function hasCardLists(infos: SetInfo[]): boolean {
  return infos.every((i) => i.cards !== undefined);
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
  if (hasCardLists(infos)) {
    const { data, cards } = await loadChosen(infos, buildDaily(refPool(infos), size).cards);
    start({ kind: "statements", title, data, cards, origin: originOf(infos) });
    return;
  }
  const data = merge(await Promise.all(infos.map(loadSet)));
  const { cards } = buildDaily(poolOf(data, infos), size);
  start({ kind: "statements", title, data, cards, origin: originOf(infos) });
}

/** 今日の復習（FSRS）。新規カードは新しい年度から順に入れる */
export async function startReview(infos: SetInfo[], title: string): Promise<void> {
  if (hasCardLists(infos)) {
    const { data, cards } = await loadChosen(infos, buildSession(refPool(infos)).cards);
    start({ kind: "statements", title, data, cards, origin: originOf(infos) });
    return;
  }
  const data = merge(await Promise.all(infos.map(loadSet)));
  const { cards } = buildSession(poolOf(data, infos));
  start({ kind: "statements", title, data, cards, origin: originOf(infos) });
}

/** 選んだ肢カードで解く（★を付けた肢：T026）。シャッフルして出す */
export async function startChosen(infos: SetInfo[], chosen: CardRef[], title: string): Promise<void> {
  const { data, cards } = await loadChosen(infos, shuffle(chosen));
  start({ kind: "statements", title, data, cards, origin: originOf(infos) });
}

/** 問で解く（本番形式） */
export async function startQuestions(info: SetInfo): Promise<void> {
  start({ kind: "questions", info, data: await loadSet(info) });
}
