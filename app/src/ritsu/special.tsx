// 特別な衣装の演出（T069）：全画面の動画（登場・決め）、小さな決めポーズ、落ちる星。動画に音はない（声はセリフとして別に流す）。
// 押すと飛ばせる。視差効果を減らす設定なら流さない。読めなければ何も出さずに先へ進む（解説や答え合わせを止めない）
import { useEffect, useState } from "react";
import { charDir } from "../character";
import { Bubble } from "../Ritsu";
import { currentTheme, isSpecial } from "./themes";
import { lineText, pickLine, playLine, type Line } from "./lines";

export type MoveName = "entrance" | "finish";
type Playing = { theme: string; name: MoveName; line?: Line; onEnd?: () => void };

/** 決めの演出は1日にこの回数まで（毎回出ると答え合わせのじゃまになる） */
const FINISH_PER_DAY = 3;
const FINISH_KEY = "tanto.special.finish.v1";
/** 動画が読めずに止まったときの見切り（ミリ秒） */
const GIVE_UP = 15000;

let playing: Playing | null = null;
let small: { theme: string; at: number } | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 全画面の演出を流す。流せないときは、すぐ onEnd を呼ぶ */
export function playMove(theme: string, name: MoveName, opts: { line?: Line; onEnd?: () => void } = {}): void {
  if (reducedMotion()) {
    opts.onEnd?.();
    return;
  }
  playing = { theme, name, ...opts };
  if (opts.line) playLine(opts.line);
  changed();
}

function underFinishLimit(today = new Date().toISOString().slice(0, 10)): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(FINISH_KEY) ?? "{}") as { day?: string; n?: number };
    const n = v.day === today ? (v.n ?? 0) : 0;
    if (n >= FINISH_PER_DAY) return false;
    localStorage.setItem(FINISH_KEY, JSON.stringify({ day: today, n: n + 1 }));
  } catch {
    // 覚えられなくても流す
  }
  return true;
}

/** レベルアップ・今日の目標の達成：特別な衣装を着ていれば、決めの演出と専用のセリフ */
export function celebrateMove(kind: "levelup" | "goal"): void {
  const theme = currentTheme();
  if (!isSpecial(theme) || !underFinishLimit()) return;
  playMove(theme, "finish", { line: pickLine(`${kind}_${theme}`, Infinity) });
}

/** 小さな決めポーズ（3問続けて正解など）。画面の隅に数秒だけ出す。押せないので、解説を読むじゃまをしない */
export function smallMove(theme = currentTheme()): void {
  if (!isSpecial(theme) || reducedMotion()) return;
  small = { theme, at: Date.now() };
  changed();
}

/** App の一番外に1つ置く */
export function SpecialMoveLayer() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);

  const end = () => {
    const done = playing?.onEnd;
    playing = null;
    changed();
    done?.();
  };
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(end, GIVE_UP);
    return () => clearTimeout(timer);
  }, [playing]);
  useEffect(() => {
    if (!small) return;
    const timer = setTimeout(() => {
      small = null;
      changed();
    }, 4000);
    return () => clearTimeout(timer);
  }, [small]);

  return (
    <>
      {small && <img key={small.at} className="special-small" src={`${charDir(small.theme)}small.webp`} alt="" aria-hidden="true" />}
      {playing && (
        <button className="special-move" aria-label="演出を飛ばす" onClick={end}>
          <video
            src={`${charDir(playing.theme)}${playing.name}.mp4`}
            poster={`${charDir(playing.theme)}tall.webp`}
            autoPlay
            muted
            playsInline
            onEnded={end}
            onError={end}
          />
          {playing.line && (
            <Bubble tail="down" className="special-move-line">
              {lineText(playing.line)}
            </Bubble>
          )}
          <span className="special-skip">押すと飛ばせます</span>
        </button>
      )}
    </>
  );
}

/** 律のまわりに、ゆっくり落ちる星 */
export function StarFall() {
  return (
    <span className="star-fall" aria-hidden="true">
      {Array.from({ length: 7 }, (_, k) => (
        <i key={k}>★</i>
      ))}
    </span>
  );
}
