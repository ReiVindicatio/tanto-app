// 分野（T016）。分野は書き出しのときに、解説が最初に引いている条文の e-Gov の目次（編・章）から決めてある（topics.json）。
// 科目の画面で分野の欄を開いたときだけ読む。正答率は、回答ログから作った「前回正解したか」で数える（絞り込みと同じ）
import { uniqueCards, type CardRef } from "./data";
import { getHistory } from "./history";
import type { HistoryRecord } from "./learning";

export type Topic = { label: string; cards: CardRef[] };
type Raw = { subjects: Record<string, { label: string; cards: string }[]> };

/** 苦手とみなす前回正解の割合（未満）と、そう判断するのに要る回答済みの枚数 */
export const WEAK_RATE = 0.6;
export const MIN_ANSWERED = 5;

let loading: Promise<Raw> | null = null;

function load(): Promise<Raw> {
  loading ??= fetch(`${import.meta.env.BASE_URL}data/topics.json`)
    .then((r) => r.json() as Promise<Raw>)
    .catch((e) => {
      loading = null; // 次に開いたときに読み直す
      throw e;
    });
  return loading;
}

/** 肢 ID（yobi-2026-minpo-q01-a）から、肢カードの参照を作る */
export function refOf(id: string): CardRef {
  return { id, question_id: id.match(/^(.*-q\d+)/)![1] };
}

/** 束の ID（yobi-2026-minpo）。肢 ID から問番号以降を除いたもの */
export function setIdOf(id: string): string {
  return id.replace(/-q\d+.*$/, "");
}

/** 科目の分野。sets に入っている年度の肢だけにする（民法の改正前の年度を除くときなど） */
export async function loadTopics(subject: string, setIds: Set<string>): Promise<Topic[]> {
  const raw = await load();
  return (raw.subjects[subject] ?? [])
    .map((t) => ({
      label: t.label,
      cards: uniqueCards(t.cards.split(" ").filter((id) => setIds.has(setIdOf(id))).map(refOf)),
    }))
    .filter((t) => t.cards.length > 0);
}

export type TopicStats = { cards: number; answered: number; lastCorrect: number; rate: number | null };

export function topicStats(t: Topic, store: Map<string, HistoryRecord> = getHistory()): TopicStats {
  let answered = 0;
  let lastCorrect = 0;
  for (const c of t.cards) {
    const r = store.get(c.id);
    if (!r) continue;
    answered++;
    if (r.last) lastCorrect++;
  }
  return { cards: t.cards.length, answered, lastCorrect, rate: answered > 0 ? lastCorrect / answered : null };
}

/** 苦手な分野：回答済みが MIN_ANSWERED 枚以上で、前回正解の割合が WEAK_RATE 未満 */
export function isWeak(s: TopicStats): boolean {
  return s.answered >= MIN_ANSWERED && s.rate !== null && s.rate < WEAK_RATE;
}

/** 苦手な順：前回正解の割合の低い順（まだ判断できない分野は後ろ。元の順を保つ） */
export function byWeakness(topics: Topic[], stats: Map<string, TopicStats>): Topic[] {
  const score = (t: Topic) => {
    const s = stats.get(t.label)!;
    return s.answered >= MIN_ANSWERED && s.rate !== null ? s.rate : 2;
  };
  return topics.map((t, i) => ({ t, i })).sort((a, b) => score(a.t) - score(b.t) || a.i - b.i).map((x) => x.t);
}
