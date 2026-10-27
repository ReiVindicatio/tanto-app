// 律のテーマ（衣装と髪型の組。T065）。絵は public/chars/ritsu/<テーマ>/。レベルで開き、選んだテーマは端末に覚える（学習記録ではない）
import { progressNow } from "../progress";

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
export type Theme = { id: string; name: string; level: number; desc?: string; motion?: Motion; bg?: string };

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

/** 開くレベルの順。絵をそろえたテーマだけを載せる */
export const THEMES: Theme[] = [
  {
    id: "default",
    name: "いつもの",
    level: 1,
    bg: "room",
    motion: { ...FULL_MOTION },
  },
  {
    id: "knit",
    name: "ひだまりニット",
    level: 3,
    bg: "window",
    desc: "冬のはじめのお休みの日。日の当たる窓辺で、ココアを飲みながら小さな六法を読む。いつものベストを脱いだ、初めての私服",
    motion: { blink: ["normal", "smile", "think", "sad", "smug", "jito"], swing: ["normal", "think", "smile"], kick: true, hop: [], mid: true, gestures: [], talk: [], talkBase: [] },
  },
];

const NO_MOTION: Motion = { blink: [], swing: [], kick: false, hop: [], mid: false, gestures: [], talk: [], talkBase: [] };

export function motionOf(id: string): Motion {
  return themeById(id)?.motion ?? NO_MOTION;
}

const KEY = "tanto.character.theme.v1";

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export function isUnlocked(t: Theme, level: number): boolean {
  return level >= t.level;
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
}

/** 次に開くテーマ */
export function nextTheme(level: number): Theme | undefined {
  return THEMES.find((t) => t.level > level);
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

export const BACKGROUNDS = [
  { id: "room", name: "律の部屋" },
  { id: "window", name: "ひだまりの窓辺" },
  { id: "library", name: "図書館" },
  { id: "night", name: "夜の机" },
  { id: "studyhall", name: "自習室" },
  { id: "sakura", name: "桜並木" },
  { id: "engawa", name: "夏の縁側" },
  { id: "snow", name: "雪の窓辺" },
] as const;

const BG_KEY = "tanto.character.bg.v1";

/** 選んだ背景（"auto"＝衣装に合わせる） */
export function chosenBg(): string {
  try {
    return localStorage.getItem(BG_KEY) ?? "auto";
  } catch {
    return "auto";
  }
}

export function setBg(id: string): void {
  try {
    localStorage.setItem(BG_KEY, id);
  } catch {
    // 覚えられなくても、今の画面では変わる
  }
}

/** 実際に出す背景 */
export function bgFor(theme: string, chosen = chosenBg()): string {
  if (chosen !== "auto" && BACKGROUNDS.some((b) => b.id === chosen)) return chosen;
  return themeById(theme)?.bg ?? "room";
}
