// 聞き流しと答え合わせのキャラクター（T063）。絵は Gemini の画像モデルで作った（pipeline/char_image.py）。
// 律が出すのは絵と名前だけ。○×と解説の見せ方は変えない（解説を「彼女の発言」にしない）

export type Expression = "normal" | "smile" | "think" | "happy" | "sad" | "sleepy" | "surprised" | "smug" | "jito";
export type CharacterKind = "base" | "chibi";

/** キャラクターの表。あとで足せるように、絵の置き場所はキャラクターごとに分ける（public/chars/<id>/） */
export const CHARACTERS = {
  ritsu: { id: "ritsu", name: "律" },
} as const;
export type CharacterId = keyof typeof CHARACTERS;
export const CHARACTER: CharacterId = "ritsu";

const BASE = import.meta.env.BASE_URL;

export function characterImage(kind: CharacterKind, face: Expression, id: CharacterId = CHARACTER): string {
  return `${BASE}chars/${id}/${kind}-${face}.webp`;
}

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
