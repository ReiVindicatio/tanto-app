// 解いている画面（/play）に渡す中身（T025）。URL には載せず、メモリに持つ。
// 再読み込みで消えたら、画面側でホームに戻す
import type { DataSet, SetInfo, Statement } from "./types";
import { loadSet, merge } from "./data";
import { applyFilter, getHistory, type Filter } from "./history";
import { shuffle } from "./shuffle";
import { buildSession } from "./srs";
import { navigate } from "./router";

export type PlaySession =
  | { kind: "statements"; title: string; data: DataSet; cards: Statement[]; examName: string; subjectName: string }
  | { kind: "questions"; info: SetInfo; data: DataSet };

let current: PlaySession | null = null;

export function currentPlay(): PlaySession | null {
  return current;
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
  start({ kind: "statements", title, data, cards, examName: infos[0].exam_name, subjectName: infos[0].subject_name });
}

/** 今日の復習（FSRS）。新規カードは新しい年度から順に入れる */
export async function startReview(infos: SetInfo[], title: string): Promise<void> {
  const data = merge(await Promise.all(infos.map(loadSet)));
  const pool = data.statements.filter((s) => s.truth_at_exam && !s.review_flag);
  const { cards } = buildSession(pool);
  start({ kind: "statements", title, data, cards, examName: infos[0].exam_name, subjectName: infos[0].subject_name });
}

/** 問で解く（本番形式） */
export async function startQuestions(info: SetInfo): Promise<void> {
  start({ kind: "questions", info, data: await loadSet(info) });
}
