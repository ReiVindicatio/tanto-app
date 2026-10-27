// 聞き流しと答え合わせのキャラクター（T063）。絵は Gemini の画像モデルで作った（pipeline/char_image.py）。
// 律が言うのは、ここと ritsu/lines.json に書いた決まった言葉だけ。○×と解説の見せ方は変えない（解説を「彼女の発言」にしない）

import { currentTheme } from "./ritsu/themes";

export type Expression = "normal" | "smile" | "think" | "happy" | "sad" | "sleepy" | "surprised" | "smug" | "jito";
/** base＝立ち絵、chibi＝ちびキャラ（全身）、sit＝欄の縁に腰かけるちびキャラ（T065。驚き以外の8表情）、lie＝縁に寝そべって本を読む（sleepy だけ）、
 *  peek＝欄の縁からのぞくちびキャラ（T063。いつもの服だけ。予備） */
export type CharacterKind = "base" | "chibi" | "sit" | "lie" | "peek";

/** キャラクターの表。あとで足せるように、絵の置き場所はキャラクターごとに分ける（public/chars/<id>/） */
export const CHARACTERS = {
  ritsu: { id: "ritsu", name: "律" },
} as const;
export type CharacterId = keyof typeof CHARACTERS;
export const CHARACTER: CharacterId = "ritsu";

const BASE = import.meta.env.BASE_URL;

/** 律の絵の置き場所（テーマのフォルダの親） */
export const CHAR_BASE = `${BASE}chars/${CHARACTER}/`;

/** 絵の URL。theme は衣装と髪型の組（T065。省くと選んでいるテーマ） */
export function characterImage(kind: CharacterKind, face: Expression, theme: string = currentTheme(), id: CharacterId = CHARACTER): string {
  return `${BASE}chars/${id}/${theme}/${kind}-${face}.webp`;
}

export const FACES: Expression[] = ["normal", "smile", "think", "happy", "sad", "sleepy", "surprised", "smug", "jito"];

/** 連続正解がこれ以上なら得意げ、連続不正解がこれ以上ならジト目 */
export const SMUG_STREAK = 3;
export const JITO_STREAK = 2;

/** 答えたときの表情（聞き流し・答え合わせで共通）。correctStreak・wrongStreak はこの答えを含めた数 */
export function reactionFace(correct: boolean, correctStreak: number, wrongStreak: number): Expression {
  if (correct) return correctStreak >= SMUG_STREAK ? "smug" : "happy";
  return wrongStreak >= JITO_STREAK ? "jito" : "sad";
}

export type ListenScene = "ready" | "reading" | "thinking" | "answer" | "paused" | "done";

/** 聞き流しの場面ごとの表情。answer の場面で押していなければ（answered === null）ふつう */
export function listenFace(scene: ListenScene, answered: boolean | null, correctStreak: number, wrongStreak: number): Expression {
  switch (scene) {
    case "ready":
    case "done":
      return "smile";
    case "reading":
      return "normal";
    case "thinking":
      return "think";
    case "paused":
      return "sleepy";
    case "answer":
      return answered === null ? "normal" : reactionFace(answered, correctStreak, wrongStreak);
  }
}

/** 出す・出さない（端末に覚える。学習記録ではない）。既定は出す */
const KEY = "tanto.character.v1";

export function characterOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setCharacterOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // 保存できなくても画面はそのまま
  }
}

// ---- 律の言葉（決まった言葉だけ。解説や○×の判断を律に言わせない） ----

/** 場面が決まっている言葉（ほかは ritsu/lines.json から選ぶ） */
export const LINES = {
  swipeTip: "右にはじくと○、左にはじくと×だよ",
  noReview: "復習する肢は、今はないよ",
} as const;

/** 初めて使う機能の案内は1回だけ（端末に覚える） */
const TIPS_KEY = "tanto.character.tips.v1";

export function tipSeen(name: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(TIPS_KEY) ?? "[]") as string[]).includes(name);
  } catch {
    return true;
  }
}

export function markTipSeen(name: string): void {
  try {
    const seen = JSON.parse(localStorage.getItem(TIPS_KEY) ?? "[]") as string[];
    if (!seen.includes(name)) localStorage.setItem(TIPS_KEY, JSON.stringify([...seen, name]));
  } catch {
    // 覚えられなくても案内が出続けるだけ
  }
}
