// 特別な衣装の「普段の違い」の試作（docs/ritsu-special-ideas.md）：案ごとにオン・オフして比べる。端末に覚える。
// 画面の飾りは html の data-fx に並べ、styles.css から html[data-fx~="<id>"] で見る
import { useEffect, useState } from "react";

export const IDEAS = [
  { id: "moon", no: 1, name: "座る場所が違う（三日月・桜の枝・光の輪・浮かぶ本・氷の結晶）" },
  { id: "stagevideo", no: 2, name: "律のページの立ち絵が動画で動く" },
  { id: "sitvideo", no: 3, name: "ちびキャラがマントを揺らし続ける（にっこりのとき）" },
  { id: "bar", no: 4, name: "○×の欄とタブの縁が衣装の色になる" },
  { id: "pal", no: 5, name: "相棒（押すと反応）" },
  { id: "shoot", no: 7, name: "答えると肢が衣装の粒になって飛ぶ" },
  { id: "scale", no: 8, name: "答えたときの反応（天秤・花びら・照明・本・結晶）" },
  { id: "combo", no: 9, name: "連続正解で覚醒（3・5・10問）" },
  { id: "redeem", no: 10, name: "前に間違えた肢を解けたときの専用のひとこと" },
  { id: "sky", no: 11, name: "育つもの（夜空・桜の木・客席・本棚・氷の城のタブ）" },
  { id: "evolve", no: 12, name: "解いた数で衣装が進化する" },
  { id: "story", no: 13, name: "解いた数で開く物語（「物語」タブ）" },
  { id: "dawn", no: 14, name: "色違い：夜明けのマント（星詠みの立ち絵のにっこり）" },
  { id: "sound", no: 16, name: "○×の音がチャイムになる" },
  { id: "wind", no: 16, name: "律のページで塔の風の音" },
  { id: "realmoon", no: 17, name: "背景の月が本物の月の形になる（星詠み）" },
  { id: "listenstage", no: 18, name: "聞き流しの背景が衣装の舞台になる" },
  { id: "daily", no: 19, name: "1日1回、最初に開いたときに登場" },
  { id: "role", no: 20, name: "全場面のセリフが役になりきる" },
  { id: "remember", no: 21, name: "ふつうの服の律が、特別な衣装のことを話す" },
  { id: "tryon", no: 22, name: "試着（10分）" },
  { id: "showcase", no: 23, name: "飾り棚（買う前の見え方）" },
  { id: "card", no: 24, name: "今日の成果カード" },
  { id: "cape", no: 31, name: "風を受ける座り絵（星詠み。いつも月に座り、マントがたなびく）" },
  { id: "signature", no: 32, name: "押すと出る全画面の技（星詠み：裁定の流星）" },
] as const;

export type IdeaId = (typeof IDEAS)[number]["id"];

/** 最初から切っておく案（音が鳴り続ける・一覧で選ぶほうが比べやすい） */
const OFF_BY_DEFAULT: IdeaId[] = ["wind", "dawn"];
const KEY = "tanto.special.fx.v1";
const listeners = new Set<() => void>();

function saved(): Partial<Record<IdeaId, boolean>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<IdeaId, boolean>>;
  } catch {
    return {};
  }
}

export function fxOn(id: IdeaId): boolean {
  return saved()[id] ?? !OFF_BY_DEFAULT.includes(id);
}

export function setFx(id: IdeaId, on: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...saved(), [id]: on }));
  } catch {
    // 覚えられなくても動く
  }
  listeners.forEach((f) => f());
}

export function setAllFx(on: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(IDEAS.map((i) => [i.id, on]))));
  } catch {
    // 覚えられなくても動く
  }
  listeners.forEach((f) => f());
}

export function onFxChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** 切り替えたら描き直す */
export function useFx(): number {
  const [n, setN] = useState(0);
  useEffect(() => onFxChange(() => setN((v) => v + 1)), []);
  return n;
}
