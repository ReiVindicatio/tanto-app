// ひっかけの型（T059）：×の肢がどう誤りにしてあるか（AI による分類。prompts/trap-types-v2.md）。traps.json は書き出しのときに作る。
// 答え合わせで型を出し、マイページで「まちがえやすい型」を出し、型ごとに解く。公式の○×は変えない
import { cardIdOf, type HistoryRecord } from "./learning";
import { getHistory } from "./history";
import { shuffle } from "./shuffle";
import { refOf } from "./topics";
import type { CardRef } from "./data";

export type TrapsDoc = {
  /** 型の英字の名前 → 画面の名前と短い説明 */
  types: Record<string, { name: string; desc: string }>;
  /** 肢カード ID → [型, 理由] */
  items: Record<string, [string, string]>;
};

let loading: Promise<TrapsDoc> | null = null;
let loaded: TrapsDoc | null = null;

export function loadTraps(): Promise<TrapsDoc> {
  loading ??= fetch(`${import.meta.env.BASE_URL}data/traps.json`)
    .then((r) => r.json() as Promise<TrapsDoc>)
    .then((t) => (loaded = t))
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export function trapsIfLoaded(): TrapsDoc | null {
  return loaded;
}

/** 画面を描き終えて手が空いてから読む（よく似た肢と同じ）。取り消し用の関数を返す */
export function loadTrapsWhenIdle(done: (t: TrapsDoc) => void): () => void {
  let alive = true;
  const run = () => loadTraps().then((t) => alive && done(t), () => {});
  const idle = "requestIdleCallback" in window;
  const handle = idle ? window.requestIdleCallback(run, { timeout: 2000 }) : window.setTimeout(run, 300);
  return () => {
    alive = false;
    if (idle) window.cancelIdleCallback(handle);
    else window.clearTimeout(handle);
  };
}

export type Trap = { type: string; name: string; desc: string; why: string };

/** 肢の型（型を付けていない肢・○の肢は null） */
export function trapOf(t: TrapsDoc, statementId: string): Trap | null {
  const x = t.items[cardIdOf(statementId)];
  if (!x) return null;
  const ty = t.types[x[0]];
  return ty ? { type: x[0], name: ty.name, desc: ty.desc, why: x[1] } : null;
}

export type TrapStat = { type: string; name: string; desc: string; answered: number; fell: number; rate: number };
/** その型の×の肢にこれだけ答えてから「まちがえやすい型」に出す */
export const MIN_TRAP_ANSWERED = 5;

/** 型ごとの、答えた×の肢と、前回○と答えた（ひっかかった）肢の数。答えた数が MIN 以上の型だけ、ひっかかった割合の高い順 */
export function trapStats(t: TrapsDoc, history: Map<string, HistoryRecord> = getHistory(), min = MIN_TRAP_ANSWERED): TrapStat[] {
  const m = new Map<string, { answered: number; fell: number }>();
  for (const [id, [type]] of Object.entries(t.items)) {
    const r = history.get(id);
    if (!r) continue;
    const x = m.get(type) ?? { answered: 0, fell: 0 };
    x.answered++;
    if (!r.last) x.fell++;
    m.set(type, x);
  }
  return [...m.entries()]
    .filter(([type, x]) => x.answered >= min && t.types[type])
    .map(([type, x]) => ({ type, name: t.types[type].name, desc: t.types[type].desc, ...x, rate: x.fell / x.answered }))
    .sort((a, b) => b.rate - a.rate || b.answered - a.answered);
}

const subjectOf = (id: string) => id.match(/-\d{4}-([a-z]+)-q/)?.[1] ?? "";
export const TRAP_DECK_MAX = 30;

/**
 * 型ごとに解く：その型の×の肢（前回まちがえた → まだ答えていない → そのほか の順に MAX 枚まで）に、
 * 同じ科目のほかの肢を同じ数だけ混ぜてシャッフルする（全部×だと分かってしまうため）。pool は出題できる肢カード
 */
export function trapDeck(t: TrapsDoc, type: string, pool: CardRef[], history: Map<string, HistoryRecord> = getHistory()): CardRef[] {
  const inPool = new Set(pool.map((c) => cardIdOf(c.id)));
  const rank = (id: string) => {
    const r = history.get(id);
    return r ? (r.last ? 2 : 0) : 1;
  };
  const mine = shuffle(Object.entries(t.items).filter(([id, [ty]]) => ty === type && inPool.has(id)).map(([id]) => id))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, TRAP_DECK_MAX);
  const chosen = new Set(mine);
  const subjects = new Set(mine.map(subjectOf));
  const others = shuffle(pool.filter((c) => !chosen.has(cardIdOf(c.id)) && subjects.has(subjectOf(c.id)))).slice(0, mine.length);
  return shuffle([...mine.map(refOf), ...others]);
}
