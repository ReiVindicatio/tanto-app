// 律のセリフ（T065）。文は lines.json（こちらで書いた決まった言葉だけ。法律の中身は言わせない）。
// 声は pipeline/ritsu_voice.py で作った public/voices/ritsu/<id>.mp3。押したときだけ鳴らす
import { useEffect, useState } from "react";
import data from "./lines.json";
import type { Expression } from "../character";

export type Line = { id: string; scene: string; text: string; face: Expression; level: number; voice?: boolean };

export const ALL_LINES = data as Line[];

const BASE = import.meta.env.BASE_URL;

/** 種から決まる乱数（描き直しても同じセリフを選ぶため） */
export function seeded(seed: number): () => number {
  let x = seed % 233280;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/** その場面で、今のレベルで開いているセリフ */
export function linesOf(scene: string, level: number): Line[] {
  return ALL_LINES.filter((l) => l.scene === scene && l.level <= level);
}

export function pickLine(scene: string, level: number, rand = Math.random): Line | undefined {
  const ls = linesOf(scene, level);
  return ls.length ? ls[Math.floor(rand() * ls.length)] : undefined;
}

/** {n} などを埋める */
export function lineText(l: Line, vars: Record<string, string | number> = {}): string {
  return l.text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

export function voiceUrl(l: Line): string | null {
  return l.voice === false ? null : `${BASE}voices/ritsu/${l.id}.mp3`;
}

/** 時間帯のあいさつの場面（端末の時刻） */
export function timeScene(d: Date): "morning" | "day" | "evening" | "latenight" {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "day";
  if (h >= 17 && h < 23) return "evening";
  return "latenight";
}

export function seasonScene(d: Date): "spring" | "summer" | "autumn" | "winter" {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

let playing: HTMLAudioElement | null = null;

// 律の声が流れているか（口パクに使う）
let speaking = false;
const speakingSubs = new Set<() => void>();
function setSpeaking(v: boolean) {
  speaking = v;
  speakingSubs.forEach((f) => f());
}

/** 律の声が流れている間 true */
export function useSpeaking(): boolean {
  const [v, setV] = useState(speaking);
  useEffect(() => {
    const f = () => setV(speaking);
    speakingSubs.add(f);
    return () => {
      speakingSubs.delete(f);
    };
  }, []);
  return v;
}

/** 律の声を流す（同時に流すのは1つ）。声がなければ何もしない */
export function playLine(l: Line): void {
  const url = voiceUrl(l);
  playing?.pause();
  if (!url) return;
  const a = new Audio(url);
  playing = a;
  a.onplaying = () => setSpeaking(true);
  a.onended = a.onpause = a.onerror = () => {
    if (playing === a) setSpeaking(false);
  };
  void a.play().catch(() => setSpeaking(false));
}

/**
 * ホームの律のひとこと：今日の目標を達成していればそのセリフ、期限の肢があれば復習の案内、
 * なければ時間帯・季節・選んでいる科目のあいさつから選ぶ。急かさない・連続記録で脅さない
 */
export function homeLine(
  due: number,
  goalReached: boolean,
  level: number,
  opts: { now?: Date; subject?: string; rand?: () => number } = {},
): { line: Line; text: string } | undefined {
  const { now = new Date(), subject, rand = Math.random } = opts;
  let scene = "home_none";
  if (goalReached) scene = "home_goal";
  else if (due > 0) scene = "home_due";
  else {
    const choices = [timeScene(now), timeScene(now), seasonScene(now), "home_none", ...(subject ? [`subject_${subject}`] : [])];
    scene = choices[Math.floor(rand() * choices.length)];
  }
  const line = pickLine(scene, level, rand) ?? pickLine("home_none", level, rand);
  return line && { line, text: lineText(line, { n: due }) };
}

/** 結果画面のひとこと（正答率で選ぶ。点数そのものには触れない） */
export function resultLine(rate: number, level: number, rand = Math.random): Line | undefined {
  return pickLine(rate >= 0.8 ? "result_good" : rate >= 0.5 ? "result_mid" : "result_hard", level, rand);
}
