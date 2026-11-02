// 特別な衣装の演出（T069）：全画面の動画（登場・決め）、小さな決めポーズ、落ちる星。動画に音はない（声はセリフとして別に流す）。
// 押すと飛ばせる。視差効果を減らす設定なら流さない。読めなければ何も出さずに先へ進む（解説や答え合わせを止めない）
import { useEffect, useState } from "react";
import { charDir } from "../character";
import { Bubble } from "../Ritsu";
import { currentTheme, isSpecial, setTheme, themeById } from "./themes";
import { fxOn, type IdeaId } from "./fx";
import { kitOf, type Reaction, type Seat } from "./kits";
import { lineText, pickLine, playLine, type Line } from "./lines";
import { SignatureLayer } from "./Signature";

export type MoveName = "entrance" | "finish";
type Playing = { theme: string; name: MoveName; line?: Line; onEnd?: () => void };

/** 決めの演出は1日にこの回数まで（毎回出ると答え合わせのじゃまになる） */
const FINISH_PER_DAY = 3;
const FINISH_KEY = "tanto.special.finish.v1";
/** 動画が読めずに止まったときの見切り（ミリ秒） */
const GIVE_UP = 15000;

let playing: Playing | null = null;
let small: { theme: string; at: number } | null = null;
let signature: string | null = null;
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

/** 全画面の技（律を押したとき・全問正解のとき）。視差効果を減らす設定なら流さない */
export function playSignature(theme = currentTheme()): void {
  if (reducedMotion() || !kitOf(theme).cape || !fxOn("signature")) return;
  signature = theme;
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

  useAmbient(() => tick((n) => n + 1));

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

  useEffect(() => {
    if (!scale) return;
    const timer = setTimeout(() => {
      scale = null;
      changed();
    }, 1500);
    return () => clearTimeout(timer);
  }, [scale]);
  useEffect(() => {
    if (!farewell) return;
    const timer = setTimeout(() => {
      farewell = null;
      changed();
    }, 5000);
    return () => clearTimeout(timer);
  }, [farewell]);

  const left = tryOnLeft();
  return (
    <>
      {signature && (
        <SignatureLayer
          key={signature}
          theme={signature}
          onEnd={() => {
            signature = null;
            changed();
          }}
        />
      )}
      {scale && <ReactionFx key={scale.at} kind={scale.kind} correct={scale.correct} />}
      {left > 0 && <div className="tryon-badge">試着中　あと {Math.ceil(left / 60000)} 分</div>}
      {farewell && <div className="tryon-badge">{farewell}</div>}
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
          <StarFall theme={playing.theme} />
          {playing.name === "entrance" && themeById(playing.theme) && <span className="special-move-title">{themeById(playing.theme)?.name}</span>}
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

/** 律のまわりに、ゆっくり落ちる粒（星・花びら・光・ほこり・雪） */
export function StarFall({ theme = currentTheme(Infinity) }: { theme?: string }) {
  const c = kitOf(theme).particle;
  return (
    <span className="star-fall" aria-hidden="true">
      {Array.from({ length: 7 }, (_, k) => (
        <i key={k}>{c}</i>
      ))}
    </span>
  );
}

// ---- 普段の違いの試作（docs/ritsu-special-ideas.md）。どれも特別な衣装を着ているときだけ・案の切り替えで切れる ----

function wearingFx(id: IdeaId): boolean {
  return isSpecial(currentTheme(Infinity)) && fxOn(id);
}

/** 答えた瞬間の演出（#7 流れ星・#8 天秤・#9 覚醒・#16 チャイム）。chimeOn：聞き流しは正解の音がもうあるので鳴らさない */
export function answerFx(correct: boolean, streak: number, cardEl: HTMLElement | null, chimeOn = true): void {
  if (!isSpecial(currentTheme(Infinity))) return;
  if (wearingFx("combo")) setCombo(streak);
  if (chimeOn && fxOn("sound")) chime(correct);
  if (reducedMotion()) return;
  if (fxOn("shoot")) shootStar(correct, cardEl);
  if (fxOn("scale")) {
    scale = { kind: kitOf(currentTheme(Infinity)).reaction, correct, at: Date.now() };
    changed();
  }
}

/** 連続正解で覚醒：3問で星が増え、5問で光をまとい、10問で欄の上が夜空に。その回の間だけ */
export function setCombo(streak: number): void {
  const level = streak >= 10 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1 : 0;
  if (level) document.documentElement.dataset.combo = String(level);
  else delete document.documentElement.dataset.combo;
}

function shootStar(correct: boolean, cardEl: HTMLElement | null): void {
  const from = cardEl?.getBoundingClientRect();
  const x0 = from ? from.left + from.width / 2 : innerWidth / 2;
  const y0 = from ? from.top + Math.min(from.height / 2, 200) : innerHeight * 0.4;
  const to = document.querySelector(".dock-ritsu, .drill-char")?.getBoundingClientRect();
  const x1 = to ? to.left + to.width / 2 : innerWidth - 60;
  const y1 = correct ? (to ? to.top + to.height / 3 : innerHeight - 120) : innerHeight + 30;
  const el = document.createElement("span");
  el.className = `shoot-star${correct ? "" : " fallen"}`;
  el.textContent = kitOf(currentTheme(Infinity)).particle;
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);
  const midX = (x0 + (correct ? x1 : x0)) / 2 + (correct ? -40 : 30);
  const a = el.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(1.5) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${midX}px, ${(y0 + y1) / 2 - (correct ? 50 : 0)}px) scale(1.1) rotate(200deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${correct ? x1 : x0 + 50}px, ${y1}px) scale(${correct ? 0.5 : 0.8}) rotate(420deg)`, opacity: correct ? 1 : 0 },
    ],
    { duration: correct ? 750 : 900, easing: "cubic-bezier(.3,.1,.6,1)" },
  );
  const done = () => el.remove();
  a.onfinish = done;
  a.oncancel = done;
}

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    audioCtx ??= new AudioContext();
    void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** 音は手元で合成する（素材を使わない）。正解はのぼる3音のチャイム、不正解は低くやわらかい1音 */
function chime(correct: boolean): void {
  const c = ctx();
  if (!c) return;
  const notes = correct ? [1046.5, 1318.5, 1568] : [392];
  notes.forEach((f, k) => {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime + k * 0.09;
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(correct ? 0.1 : 0.06, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (correct ? 0.7 : 0.45));
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.8);
  });
}

/** 律のページの塔の風（#16）。雑音をしぼって小さく流す。ページを離れると止まる */
export function TowerWind() {
  useEffect(() => {
    const c = ctx();
    if (!c) return;
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 420;
    f.Q.value = 0.6;
    const g = c.createGain();
    g.gain.value = 0.025;
    src.connect(f).connect(g).connect(c.destination);
    src.start();
    return () => src.stop();
  }, []);
  return null;
}

/** 前に間違えた肢を解けたときのひとこと（#10）。文字だけ（答え合わせの途中に声を割り込ませない） */
export function redeemLine(): string | undefined {
  const theme = currentTheme(Infinity);
  if (!wearingFx("redeem")) return undefined;
  return pickLine(`redeem_${theme}`, Infinity)?.text;
}

/** 相棒の星の子（#5）：律のまわりを飛ぶ。押すと跳ねて、律がひとこと */
export function StarPal({ theme }: { theme: string }) {
  const [hit, setHit] = useState(0);
  return (
    <span
      key={hit}
      className={`star-pal${hit ? " hit" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        setHit((n) => n + 1);
        const l = pickLine(`pal_${theme}`, Infinity);
        if (l) playLine(l);
      }}
    >
      <img src={`${charDir(theme)}star-pal.webp`} alt={kitOf(theme).pal} />
    </span>
  );
}

// 試着（#22）：今は管理者が流れを確かめるだけ（買っていない人の通行証はサーバーがまだ出さない）
const TRYON_KEY = "tanto.special.tryon.v1";
const TRYON_MS = 10 * 60 * 1000;
type TryOn = { theme: string; prev: string; until: number };

function tryOn(): TryOn | null {
  try {
    return JSON.parse(localStorage.getItem(TRYON_KEY) ?? "null") as TryOn | null;
  } catch {
    return null;
  }
}

export function tryOnLeft(): number {
  const t = tryOn();
  return t ? Math.max(0, t.until - Date.now()) : 0;
}

export function startTryOn(theme: string): void {
  try {
    localStorage.setItem(TRYON_KEY, JSON.stringify({ theme, prev: currentTheme(Infinity), until: Date.now() + TRYON_MS }));
  } catch {
    return;
  }
  setTheme(theme);
  changed();
}

function endTryOn(): void {
  const t = tryOn();
  if (!t) return;
  localStorage.removeItem(TRYON_KEY);
  setTheme(t.prev === t.theme ? "default" : t.prev);
  const l = pickLine(`tryon_${t.theme}`, Infinity);
  if (l) {
    farewell = l.text;
    playLine(l);
  }
  changed();
}

/** App の一番外の常駐の処理：1日1回の登場（#19）・横切る律（#6）・試着の残り時間（#22） */
function useAmbient(tick: () => void): void {
  useEffect(() => {
    const theme = currentTheme(Infinity);
    if (isSpecial(theme) && fxOn("daily") && !reducedMotion() && !location.pathname.includes("/reveal/")) {
      const today = new Date().toDateString();
      try {
        if (localStorage.getItem(DAILY_KEY) !== today) {
          localStorage.setItem(DAILY_KEY, today);
          playMove(theme, "entrance");
        }
      } catch {
        // 覚えられなければ流さない
      }
    }
    const clock = window.setInterval(() => {
      if (tryOn() && tryOnLeft() <= 0) endTryOn();
      else if (tryOn()) tick();
    }, 15000);
    return () => {
      window.clearInterval(clock);
    };
  }, []);
}

const DAILY_KEY = "tanto.special.daily.v1";
let scale: { kind: Reaction; correct: boolean; at: number } | null = null;
let farewell: string | null = null;

/** 答えたときの反応（#8）：衣装ごとに違う。正解で明るく、不正解は責めない形で小さく */
function ReactionFx({ kind, correct }: { kind: Reaction; correct: boolean }) {
  if (kind === "petals") {
    return (
      <span className={`react-petals ${correct ? "ok" : "ng"}`} aria-hidden="true">
        {Array.from({ length: correct ? 10 : 3 }, (_, k) => (
          <i key={k} style={{ "--a": `${k * 36}deg` } as React.CSSProperties}>❀</i>
        ))}
      </span>
    );
  }
  if (kind === "light") return <span className={`react-light ${correct ? "ok" : "ng"}`} aria-hidden="true" />;
  if (kind === "page") {
    return (
      <svg className={`react-page ${correct ? "ok" : "ng"}`} viewBox="-50 -36 100 72" aria-hidden="true">
        <path d="M 0 -26 C -14 -34 -32 -32 -42 -26 L -42 26 C -32 20 -14 18 0 26 Z" fill="#f3ead6" stroke="#8b86b5" strokeWidth="1.5" />
        <path d="M 0 -26 C 14 -34 32 -32 42 -26 L 42 26 C 32 20 14 18 0 26 Z" fill="#f3ead6" stroke="#8b86b5" strokeWidth="1.5" />
        <path className="turning" d="M 0 -26 C 14 -34 32 -32 42 -26 L 42 26 C 32 20 14 18 0 26 Z" fill="#fff" stroke="#8b86b5" strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === "crystal") {
    return (
      <svg className={`react-crystal ${correct ? "ok" : "ng"}`} viewBox="-50 -50 100 100" aria-hidden="true">
        {Array.from({ length: 6 }, (_, k) => (
          <g key={k} transform={`rotate(${k * 60})`} stroke="#9fd4ee" strokeWidth="3" strokeLinecap="round" fill="none">
            <path d="M 0 0 L 0 -42 M 0 -18 L -10 -28 M 0 -18 L 10 -28 M 0 -30 L -7 -37 M 0 -30 L 7 -37" />
          </g>
        ))}
      </svg>
    );
  }
  return (
    <svg className={`scale-fx ${correct ? "ok" : "ng"}`} viewBox="-50 -40 100 90" aria-hidden="true">
      <circle cx="0" cy="-32" r="4" fill="#ffe9a0" />
      <line x1="0" y1="-28" x2="0" y2="34" stroke="#d9b45a" strokeWidth="2.5" />
      <path d="M -14 38 Q 0 30 14 38 Z" fill="#d9b45a" />
      <g className="scale-beam">
        <line x1="-36" y1="-20" x2="36" y2="-20" stroke="#d9b45a" strokeWidth="2.5" strokeLinecap="round" />
        <g className="pan left"><path d="M -36 -20 L -46 6 M -36 -20 L -26 6" stroke="#d9b45a" strokeWidth="1" /><path d="M -47 6 Q -36 16 -25 6 Z" fill="#e8c35a" /><text x="-36" y="9" fontSize="9" textAnchor="middle" fill="#fff6d8">★</text></g>
        <g className="pan right"><path d="M 36 -20 L 26 6 M 36 -20 L 46 6" stroke="#d9b45a" strokeWidth="1" /><path d="M 25 6 Q 36 16 47 6 Z" fill="#e8c35a" /><text x="36" y="9" fontSize="9" textAnchor="middle" fill="#fff6d8">★</text></g>
      </g>
    </svg>
  );
}

/** 律が腰かけるもの（#1）。形が単純なのでコードで描く（AI の絵は頼んでいない人物が入った） */
export function CostumeSeat({ kind }: { kind: Seat }) {
  if (kind === "branch") {
    return (
      <svg className="moon-seat seat-branch" viewBox="0 0 200 110" aria-hidden="true">
        <path d="M 2 62 C 50 40 130 72 198 44 L 198 56 C 130 86 50 54 2 76 Z" fill="#8a5a44" stroke="#6d4433" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M 150 58 C 165 40 175 34 190 22" stroke="#6d4433" strokeWidth="4" fill="none" strokeLinecap="round" />
        {[[22, 48], [46, 44], [160, 42], [186, 22], [176, 50], [10, 70], [190, 62], [70, 76], [128, 84]].map(([x, y], k) => (
          <text key={k} x={x} y={y} fontSize={k % 2 ? 16 : 20} textAnchor="middle" fill="#f8bcd0" stroke="#e38fae" strokeWidth="0.5">❀</text>
        ))}
      </svg>
    );
  }
  if (kind === "spot") {
    return (
      <svg className="moon-seat seat-spot" viewBox="0 0 200 110" aria-hidden="true">
        <ellipse cx="100" cy="60" rx="94" ry="20" fill="#2a2350" stroke="#e7c6ff" strokeWidth="2.5" />
        <ellipse cx="100" cy="60" rx="74" ry="13" fill="none" stroke="#9fe8ff" strokeWidth="1.5" opacity="0.8" />
        <ellipse cx="100" cy="83" rx="70" ry="9" fill="#e7c6ff" opacity="0.25" />
      </svg>
    );
  }
  if (kind === "book") {
    return (
      <svg className="moon-seat seat-book" viewBox="0 0 200 110" aria-hidden="true">
        <path d="M 100 52 C 70 38 30 40 6 50 L 6 84 C 30 74 70 72 100 88 C 130 72 170 74 194 84 L 194 50 C 170 40 130 38 100 52 Z" fill="#3a2f58" stroke="#cfc8e8" strokeWidth="2" strokeLinejoin="round" />
        <path d="M 100 52 C 74 42 38 44 14 52 L 14 76 C 38 66 74 66 100 80 C 126 66 162 66 186 76 L 186 52 C 162 44 126 42 100 52 Z" fill="#f3ead6" />
        <path d="M 100 52 L 100 80" stroke="#b5ab90" strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === "ice") {
    return (
      <svg className="moon-seat seat-ice" viewBox="0 0 200 110" aria-hidden="true">
        <defs>
          <linearGradient id="seat-ice" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f2fbff" />
            <stop offset="1" stopColor="#9fd4ee" />
          </linearGradient>
        </defs>
        <path d="M 6 44 L 44 36 L 100 42 L 158 36 L 194 44 L 170 74 L 132 100 L 100 88 L 66 102 L 30 74 Z" fill="url(#seat-ice)" stroke="#6fb6d8" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M 44 36 L 66 102 M 100 42 L 100 88 M 158 36 L 132 100" stroke="#fff" strokeWidth="1.2" opacity="0.8" />
      </svg>
    );
  }
  return (
    <svg className="moon-seat" viewBox="0 0 200 110" aria-hidden="true">
      <defs>
        <linearGradient id="moon-seat-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3bd" />
          <stop offset="1" stopColor="#e6b94f" />
        </linearGradient>
      </defs>
      <path d="M 4 6 C 22 62 178 62 196 6 C 200 136 0 136 4 6 Z" fill="url(#moon-seat-gold)" stroke="#c99a35" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="24" y="16" fontSize="11" fill="#ffe9a0">★</text>
      <text x="170" y="12" fontSize="8" fill="#ffe9a0">★</text>
    </svg>
  );
}
