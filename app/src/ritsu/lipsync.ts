// 口パクを声に合わせる（T065）：流している音声を裏でもう一度読み、0.04秒ごとの声の大きさを出しておく。
// 再生中は、今の位置で声が出ているときだけ口を動かす（読み終わり・句読点の間は閉じる）。
// 再生そのもの（<audio>）には手を入れない（ロック画面の操作や、画面を消した再生をこわさない）
import { useEffect, useState } from "react";

export const STEP = 0.04; // 秒
const OPEN_AT = 0.14; // いちばん大きい声に対してこれ以上なら「声が出ている」
const FLAP_MS = 110; // 声が出ている間、口を開け閉めする速さ（音節のように）

/** 音の波形から、STEP 秒ごとの大きさ（いちばん大きいところを1）を出す */
export function envelope(samples: Float32Array, sampleRate: number, step = STEP): Float32Array {
  const n = Math.max(1, Math.ceil(samples.length / (sampleRate * step)));
  const out = new Float32Array(n);
  const per = Math.max(1, Math.floor(sampleRate * step));
  let max = 0;
  for (let k = 0; k < n; k++) {
    let sum = 0;
    const from = k * per;
    const to = Math.min(samples.length, from + per);
    for (let i = from; i < to; i++) sum += samples[i] * samples[i];
    out[k] = Math.sqrt(sum / Math.max(1, to - from));
    if (out[k] > max) max = out[k];
  }
  if (max > 0) for (let k = 0; k < n; k++) out[k] /= max;
  return out;
}

/** その位置で声が出ているか */
export function voicedAt(env: Float32Array, t: number, step = STEP): boolean {
  const k = Math.floor(t / step);
  return k >= 0 && k < env.length && env[k] >= OPEN_AT;
}

const cache = new Map<string, Promise<Float32Array | null>>();

function envelopeOf(url: string): Promise<Float32Array | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = (async () => {
    try {
      const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
      if (!Ctx) return null;
      const buf = await (await fetch(url)).arrayBuffer();
      const audio = await new Ctx(1, 1, 44100).decodeAudioData(buf);
      return envelope(audio.getChannelData(0), audio.sampleRate);
    } catch {
      return null; // 読めなければ、時間で開け閉めする
    }
  })();
  cache.set(url, p);
  if (cache.size > 40) cache.delete(cache.keys().next().value!); // 古いものから捨てる
  return p;
}

let current: { el: HTMLAudioElement; env: Float32Array | null } | null = null;

/** 律の声を流しはじめたら呼ぶ（無音のファイルは数えない） */
export function trackVoice(el: HTMLAudioElement, url: string): void {
  if (url.includes("/sounds/silence-")) {
    if (current?.el === el) current = null;
    return;
  }
  const entry = { el, env: null as Float32Array | null };
  current = entry;
  void envelopeOf(url).then((env) => {
    if (current === entry) entry.env = env;
  });
}

function mouthOpenNow(): boolean {
  const flap = Math.floor(performance.now() / FLAP_MS) % 2 === 0;
  if (current && !current.el.paused && !current.el.ended) {
    return current.env ? voicedAt(current.env, current.el.currentTime) && flap : flap;
  }
  // 音声ファイルがなく端末の読み上げで読んでいるとき（声の大きさは分からない）
  if (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking) return flap;
  return false;
}

/** active の間、口を開けているか（声に合わせる） */
export function useMouthOpen(active: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!active) {
      setOpen(false);
      return;
    }
    let raf = 0;
    let last = false;
    const loop = () => {
      const v = mouthOpenNow();
      if (v !== last) {
        last = v;
        setOpen(v);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return open;
}
