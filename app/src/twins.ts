// よく似た肢（T050）：文がよく似ているのに出題時点の○×が逆の肢カードの組。組は書き出しのときに決めてある（twins.json）。
// 肢カードを最初に開いたときだけ読む。答え合わせの後に相手の肢を出すのと、科目の画面の「よく似た肢を続けて解く」に使う
import { cardIdOf } from "./learning";
import { MINPO_REFORM_YEAR } from "./LawNote";
import { shuffle } from "./shuffle";
import { refOf, setIdOf } from "./topics";
import type { CardRef } from "./data";

/** [始め, 終わり) の文字の範囲 */
export type Range = [number, number];
export type TwinCard = { text: string; truth: boolean; src: string; ids: string[] };
type Pair = { a: string; b: string; sim: number; ad: Range[]; bd: Range[] };
export type Twins = { pairs: Pair[]; cards: Record<string, TwinCard> };

/** 答え合わせの後に出すときの、こちらの肢と相手の肢（どちらも違う部分つき） */
export type TwinView = { mine: TwinCard; mineDiff: Range[]; other: TwinCard; otherId: string; otherDiff: Range[]; sim: number };

let loading: Promise<Twins> | null = null;
let loaded: Twins | null = null;

export function loadTwins(): Promise<Twins> {
  loading ??= fetch(`${import.meta.env.BASE_URL}data/twins.json`)
    .then((r) => r.json() as Promise<Twins>)
    .then((t) => (loaded = t))
    .catch((e) => {
      loading = null; // 次に開いたときに読み直す
      throw e;
    });
  return loading;
}

/** 画面を描き終えて手が空いてから読む（最初の1枚の表示を遅らせないように）。取り消し用の関数を返す */
export function loadTwinsWhenIdle(done: (t: Twins) => void): () => void {
  let alive = true;
  const run = () => loadTwins().then((t) => alive && done(t), () => {}); // 読めなくても（通信なしなど）解くのには困らない
  const idle = "requestIdleCallback" in window; // 使えないブラウザでは、少し待ってから読む
  const handle = idle ? window.requestIdleCallback(run, { timeout: 2000 }) : window.setTimeout(run, 300);
  return () => {
    alive = false;
    if (idle) window.cancelIdleCallback(handle);
    else window.clearTimeout(handle);
  };
}

/** 読み終わっていれば返す（描画中に待たないため） */
export function twinsIfLoaded(): Twins | null {
  return loaded;
}

const yearOf = (id: string) => Number(id.match(/-(\d{4})-/)?.[1] ?? 0);
/** 民法の改正前（決定006）の年度にしか出ていない肢カード */
const onlyPreReformMinpo = (c: TwinCard) => (c.ids ?? []).every((id) => id.includes("-minpo-") && yearOf(id) < MINPO_REFORM_YEAR);

/**
 * 答え合わせの後に出す、よく似た肢（似ている順に max まで）。
 * upcoming：このあと出題する肢カード（相手が入っていたら出さない。答えが先に分かってしまうため）。
 * 民法の改正前の年度にしか出ていない相手は、こちらも改正前のときだけ出す
 */
export function twinsOf(t: Twins, statementId: string, upcoming: Set<string>, max = 2): TwinView[] {
  const id = cardIdOf(statementId);
  const mine = t.cards[id];
  if (!mine) return [];
  const out: TwinView[] = [];
  for (const p of t.pairs) {
    if (p.a !== id && p.b !== id) continue;
    const [otherId, mineDiff, otherDiff] = p.a === id ? [p.b, p.ad, p.bd] : [p.a, p.bd, p.ad];
    const other = t.cards[otherId];
    if (!other || upcoming.has(otherId)) continue;
    if (onlyPreReformMinpo(other) && !onlyPreReformMinpo(mine)) continue;
    out.push({ mine, mineDiff, other, otherId, otherDiff, sim: p.sim });
  }
  return out.sort((x, y) => y.sim - x.sim).slice(0, max);
}

/** 肢カードの、絞り込みに入っている年度の出典の肢（なければ null） */
function refIn(c: TwinCard, setIds: Set<string>): CardRef | null {
  const id = (c.ids ?? []).find((i) => setIds.has(setIdOf(i))); // ids がない古い twins.json でも落ちないように
  return id ? refOf(id) : null;
}

/**
 * 双子のモードに使う組：科目の組で、両方の肢が絞り込みの年度に入っているもの。
 * 1枚が複数の組に出るときは、似ている順に先の組だけ使う（同じ肢を1回に2度出さない。数が毎回同じになるように）
 */
function pairsIn(t: Twins, subject: string, setIds: Set<string>): [CardRef, CardRef][] {
  const used = new Set<string>();
  const out: [CardRef, CardRef][] = [];
  for (const p of [...t.pairs].sort((x, y) => y.sim - x.sim)) {
    if (!p.a.includes(`-${subject}-`) || used.has(p.a) || used.has(p.b)) continue;
    if (!t.cards[p.a] || !t.cards[p.b]) continue;
    const a = refIn(t.cards[p.a], setIds);
    const b = refIn(t.cards[p.b], setIds);
    if (!a || !b) continue;
    used.add(p.a).add(p.b);
    out.push([a, b]);
  }
  return out;
}

export function pairCount(t: Twins, subject: string, setIds: Set<string>): number {
  return pairsIn(t, subject, setIds).length;
}

/** 双子のモードの出題順：組の順はシャッフルし、組の2枚は続けて出す（どちらが先かもシャッフル） */
export function pairDeck(t: Twins, subject: string, setIds: Set<string>, random = Math.random): CardRef[] {
  return shuffle(pairsIn(t, subject, setIds))
    .map((pair) => (random() < 0.5 ? pair : [pair[1], pair[0]]))
    .flat();
}
