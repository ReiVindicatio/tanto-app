// 律のテーマ（衣装と髪型の組。T065）。絵は public/chars/ritsu/<テーマ>/。レベルで開き、選んだテーマは端末に覚える（学習記録ではない）
import { inTrial } from "./trial";
import { progressNow } from "../progress";
import costumes from "./costumes.json";
import { asUser, isAdmin, isOwned } from "../admin";
import { kitOf } from "./kits";
import { mockSubmits } from "../extraXp";
import { currentState } from "../learning";
import { forceTheme } from "../theme";
import { fxOn, IDEAS, onFxChange } from "./fx";

/** 動きのコマ（T065）。あるものだけ動かす：blink＝目を閉じた絵がある表情、swing＝足を振ったコマがある表情、kick＝寝そべりの足のコマ、
 *  hop＝跳ねたところの絵がある表情、mid＝座る→寝そべるの間の絵 */
export type Motion = {
  blink: string[];
  swing: string[];
  kick: boolean;
  hop: string[];
  mid: boolean;
  /** 仕草の絵があるもの（yawn・stretch・rub・sip・signature＝衣装の動作・nod・clap・pout） */
  gestures: string[];
  /** 口パクの絵がある表情（腰かける絵） */
  talk: string[];
  /** 口パクの絵がある表情（立ち絵） */
  talkBase: string[];
};
/** desc＝どんなときの衣装か（お披露目で見せる。docs/ritsu-costumes.md の設計書から） */
export type Theme = {
  id: string;
  name: string;
  /** 開くレベル（unlock がないとき）。買う衣装・節目の衣装では並びにだけ使う */
  level: number;
  /** 開き方（T068）。なければレベル。mockN＝模試を N 回提出。paid＝購入（買えるようになるまで開かない） */
  unlock?: string;
  desc?: string;
  motion?: Motion;
  bg?: string;
};

/** 並び：レベルで開くものをレベルの順に、そのあとに節目の衣装 */
function byUnlock(a: Theme, b: Theme): number {
  return Number(!!a.unlock) - Number(!!b.unlock) || a.level - b.level;
}

/** 絵をひととおりそろえたテーマの動き（2026-10-27 の作り方。char_image.py の motion_set・extras_set） */
const FULL_MOTION: Motion = {
  blink: ["normal", "smile", "think", "sad", "smug", "jito"],
  swing: ["normal", "think", "smile"],
  kick: true,
  hop: [],
  mid: true,
  gestures: ["yawn", "stretch", "rub", "sip", "signature", "nod", "clap", "pout"],
  talk: ["normal", "smile", "happy", "sad", "think"],
  talkBase: ["normal", "smile", "think", "happy", "sad", "sleepy", "surprised", "smug", "jito"],
};

/** 開くレベルの順。絵をそろえたテーマだけを載せる。いつもの服のほかは costumes.json（pipeline/ritsu_theme.py build が足す） */
export const THEMES: Theme[] = [
  { id: "default", name: "いつもの", level: 1, bg: "room", motion: { ...FULL_MOTION } },
  ...(costumes as Omit<Theme, "motion">[]).map((c) => ({ ...c, motion: { ...FULL_MOTION } })).sort(byUnlock),
];

const NO_MOTION: Motion = { blink: [], swing: [], kick: false, hop: [], mid: false, gestures: [], talk: [], talkBase: [] };

export function motionOf(id: string): Motion {
  return themeById(id)?.motion ?? NO_MOTION;
}

const KEY = "tanto.character.theme.v1";

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

/** 特別な衣装（T069）。絵・声・動画は R2 にあり、Worker が通行証を確かめて渡す */
export function isSpecial(id: string): boolean {
  return themeById(id)?.unlock === "paid";
}

/** 開いているか。管理者は全部。一度お披露目を見た衣装は、条件を見直しても開いたまま */
export function isUnlocked(t: Theme, level: number): boolean {
  if (t.id === "default" || isAdmin()) return true;
  // 端末の値（見た印）では開かない。絵もサーバーが渡さない。お試しの1着だけサーバーが48時間渡す（T070）。持っている衣装（ベータ版の特典：T074）は通行証で渡す
  if (t.unlock === "paid") return inTrial(t.id) || isOwned(t.id);
  if (!asUser() && isRevealed(t.id)) return true; // 一般の見え方を確かめている間は、見た印を数えない
  const m = t.unlock?.match(/^mock(\d+)$/);
  if (m) return mockSubmits() >= Number(m[1]);
  return level >= t.level;
}

/** まだ開いていない衣装の案内 */
export function unlockLabel(t: Theme): string {
  if (t.unlock === "paid") return "準備中";
  const m = t.unlock?.match(/^mock(\d+)$/);
  if (m) return `模試を${m[1]}回提出で開く`;
  return `Lv.${t.level} で開く`;
}

/** 選んだテーマ（まだ開いていない・なくなったテーマなら「いつもの」） */
export function currentTheme(level = progressNow().level): string {
  let id = "default";
  try {
    id = localStorage.getItem(KEY) ?? "default";
  } catch {
    // 読めなければ「いつもの」
  }
  const t = themeById(id);
  return t && isUnlocked(t, level) ? t.id : "default";
}

export function setTheme(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // 覚えられなくても、今の画面では着替えられる
  }
  applyCostume();
}

/** 特別な衣装を着ている間、画面の飾りを変える（html の data-costume。styles.css） */
export function applyCostume(): void {
  const id = currentTheme();
  const root = document.documentElement;
  if (isSpecial(id)) {
    root.dataset.costume = id;
    root.dataset.fx = IDEAS.filter((i) => fxOn(i.id)).map((i) => i.id).join(" ");
    root.dataset.evo = String(fxOn("evolve") ? evoStage() : 0);
    root.style.setProperty("--costume-bg", `url(${import.meta.env.BASE_URL}special/${id}/${kitOf(id).worldBg})`);
  } else {
    delete root.dataset.costume;
    delete root.dataset.fx;
    delete root.dataset.evo;
    root.style.removeProperty("--costume-bg");
    delete root.dataset.combo;
  }
  // 画面のテーマは衣装と別に選ぶ（開いている特別な衣装のものだけ）
  const world = currentWorld();
  if (world) root.dataset.world = world;
  else delete root.dataset.world;
  forceTheme(world ? (kitOf(world).world.dark ? "dark" : "light") : null);
}

/** 画面のテーマ：着ている特別な衣装で決まる（衣装の ID。ふつうの衣装なら空） */
export function currentWorld(): string {
  const id = currentTheme();
  return isSpecial(id) ? id : "";
}
onFxChange(applyCostume);

// ---- 衣装の進化（docs/ritsu-special-ideas.md の12）：正解した肢の数で段階が上がる。減らない ----

const EVO_AT = [0, 300, 1000];
const EVO_KEY = "tanto.special.evo.v1";

/** 一度でも正解した肢の数 */
export function solvedCount(): number {
  let n = 0;
  for (const r of currentState().history.values()) if (r.correct > 0) n++;
  return n;
}

/** 確かめるために段階を指定する（null＝実際の数） */
export function evoOverride(): number | null {
  try {
    const v = localStorage.getItem(EVO_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export function setEvoOverride(v: number | null): void {
  try {
    if (v === null) localStorage.removeItem(EVO_KEY);
    else localStorage.setItem(EVO_KEY, String(v));
  } catch {
    // 覚えられなくても動く
  }
  applyCostume();
}

export function evoStage(): number {
  const o = evoOverride();
  if (o !== null) return o;
  const n = solvedCount();
  return EVO_AT.reduce((s, at, k) => (n >= at ? k : s), 0);
}

/** 次に開くテーマ */
export function nextTheme(level: number): Theme | undefined {
  return THEMES.find((t) => !t.unlock && t.level > level);
}

// ---- お披露目（T065）：新しいテーマが開いたら、一枚絵と律のセリフで見せる。見たかどうかは端末に覚える ----

const REVEALED = "tanto.character.revealed.v1";

function revealedList(): string[] {
  try {
    return JSON.parse(localStorage.getItem(REVEALED) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function isRevealed(id: string): boolean {
  return revealedList().includes(id);
}

export function markRevealed(id: string): void {
  try {
    const l = revealedList();
    if (!l.includes(id)) localStorage.setItem(REVEALED, JSON.stringify([...l, id]));
  } catch {
    // 覚えられなくても、お披露目がもう一度出るだけ
  }
}

/** 開いたのにまだお披露目を見ていないテーマ（開く順で最初の1つ） */
export function pendingReveal(level: number): Theme | undefined {
  return THEMES.find((t) => t.id !== "default" && isUnlocked(t, level) && !isRevealed(t.id));
}

// ---- 律のページの背景（T065）。「衣装に合わせる」なら衣装ごとの背景（Theme.bg）----

/** 背景は衣装で決まる（選ぶ場所は分かりにくく、衣装の印象にも合わなかった：ユーザー 2026-11-02） */
export function bgFor(theme: string): string {
  return themeById(theme)?.bg ?? "room";
}
