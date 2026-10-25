// 解いている画面（/play）に渡す中身（T025）。URL には載せず、メモリに持つ。
// 再読み込みで消えたら、画面側でホームに戻す
import type { DataSet, Question, SetInfo, Statement } from "./types";
import { EXAM_SHORT, cardRefsOf, loadSet, merge, uniqueCards, type CardRef } from "./data";
import { applyFilter, getHistory, type Filter } from "./history";
import { shuffle } from "./shuffle";
import { buildSession } from "./srs";
import { buildDaily, ENDLESS_BATCH } from "./daily";
import { cardIdOf } from "./learning";
import { navigate } from "./router";
import type { Exams, MockUnit } from "./mock";

/** 問の出典の名前（試験名・科目名）。今日の○問では科目がまざるので、問ごとに引く */
export type OriginOf = (q: Question) => { examName: string; subjectName: string };

/** エンドレス：まだ出していない肢（exclude はこのあと出す予定の肢カード）から、次のひとまとまりを選んで読む */
export type More = (exclude: Set<string>) => Promise<{ data: DataSet; cards: Statement[] }>;

export type PlaySession =
  | { kind: "statements"; title: string; data: DataSet; cards: Statement[]; origin: OriginOf; more?: More }
  | { kind: "listen"; title: string; data: DataSet; cards: Statement[]; origin: OriginOf; more: More }
  | { kind: "mock"; unit: MockUnit; minutes: number; data: DataSet; exams: Exams | null }
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

/** エンドレス：今日の○問と同じ選び方で20問ずつ選び、残りが少なくなったら次を足す。「終わる」で結果を出す */
export async function startEndless(infos: SetInfo[], title: string): Promise<void> {
  const next = endlessSource(infos);
  const { data, cards } = await next(new Set());
  start({ kind: "statements", title, data, cards, origin: originOf(infos), more: next });
}

/** 今日の○問の選び方で、exclude を除いて次の20問を選んで読む（エンドレス・聞き流し） */
function endlessSource(infos: SetInfo[], keep: (s: Statement) => boolean = () => true): More {
  return async (exclude) => {
    const pool = refPool(infos).filter((c) => !exclude.has(cardIdOf(c.id)));
    const { data, cards } = await loadChosen(infos, buildDaily(pool, ENDLESS_BATCH).cards);
    return { data, cards: cards.filter(keep) };
  };
}

/**
 * 聞き流し（T057）：エンドレスと同じ選び方。読み上げだけで分かる肢にする
 * （前提文の要る肢・小問の肢は、肢だけ読んでも意味が通らないので除く）
 */
export async function startListen(infos: SetInfo[], title: string): Promise<void> {
  const next = endlessSource(infos, (s) => !s.requires_context && s.sub === undefined);
  const { data, cards } = await next(new Set());
  start({ kind: "listen", title, data, cards, origin: originOf(infos), more: next });
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

/** よく似た肢を続けて解く（T050）：並びは決めてある（組の2枚を続けて出す）のでシャッフルしない */
export async function startInOrder(infos: SetInfo[], chosen: CardRef[], title: string): Promise<void> {
  const { data, cards } = await loadChosen(infos, chosen);
  start({ kind: "statements", title, data, cards, origin: originOf(infos) });
}

/** 模試（T028）：単位（科目群・科目）の束を全部読んで、本番の時間で解く */
export async function startMock(unit: MockUnit, minutes: number, exams: Exams | null): Promise<void> {
  const data = merge(await Promise.all(unit.sets.map(loadSet)));
  start({ kind: "mock", unit, minutes, data, exams });
}

/** 問で解く（本番形式） */
export async function startQuestions(info: SetInfo): Promise<void> {
  start({ kind: "questions", info, data: await loadSet(info) });
}
