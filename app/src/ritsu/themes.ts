// 律のテーマ（衣装と髪型の組。T065）。絵は public/chars/ritsu/<テーマ>/。レベルで開き、選んだテーマは端末に覚える（学習記録ではない）
import { progressNow } from "../progress";

/** 動きのコマ（T065）。あるものだけ動かす：blink＝目を閉じた絵がある表情、kick＝寝そべりの足のコマ、hop＝跳ねたところの絵がある表情、mid＝座る→寝そべるの間の絵 */
export type Motion = { blink: string[]; kick: boolean; hop: string[]; mid: boolean };
export type Theme = { id: string; name: string; level: number; motion?: Motion };

/** 開くレベルの順。絵をそろえたテーマだけを載せる */
export const THEMES: Theme[] = [
  { id: "default", name: "いつもの", level: 1, motion: { blink: ["normal", "smile", "think", "sad", "smug", "jito"], kick: true, hop: [], mid: true } },
];

const NO_MOTION: Motion = { blink: [], kick: false, hop: [], mid: false };

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
