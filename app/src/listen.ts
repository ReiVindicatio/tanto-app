// 聞き流しモード（T057・T058）の読み上げ。肢カードごとに手元で作っておいた音声（Google Cloud Text-to-Speech・Chirp 3 HD）を
// 再生する（/audio/tts/<声>/<カード ID>.q.mp3・.a.mp3。worker/audio.ts が R2 から返す）。音声がないときは、
// 端末の音声合成（Web Speech API の speechSynthesis）で読む

/** 読み間違えやすい語の読み替え。読み間違いに気づいたら足す */
export const READINGS: [string, string][] = [
  ["瑕疵", "かし"],
  ["競売", "けいばい"],
  ["遺言", "いごん"],
  ["○", "まる"],
  ["×", "ばつ"],
];

const SLOT_MARK = /\s*[［[]\s*(?:№|No\.?|Ｎｏ．?)\s*[0-9０-９]+\s*[］\]]/g;

/** 読み上げる文：解答欄の番号（［№11］）を除き、読み替えの表を当てる */
export function speechText(text: string): string {
  // 古い年度の問題文は読点が「，」「．」。読み上げの区切りが分かるように「、」「。」にそろえる（pipeline/tts_sample.py と同じ）
  let t = text.replace(SLOT_MARK, "").trim().replace(/，/g, "、").replace(/．/g, "。");
  for (const [from, to] of READINGS) t = t.split(from).join(to);
  return t;
}

/**
 * 長い文を区切る。パソコンの Chrome は1回に長く読ませると途中で止まることがあるので、句点で区切り、
 * それでも長ければ読点で区切る
 */
export function chunks(text: string, max = 80): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=。)/)) {
    if (sentence.length <= max) {
      if (sentence.trim()) out.push(sentence);
      continue;
    }
    let buf = "";
    for (const part of sentence.split(/(?<=、)/)) {
      if (buf && buf.length + part.length > max) {
        out.push(buf);
        buf = "";
      }
      buf += part;
    }
    if (buf.trim()) out.push(buf);
  }
  return out;
}

export type ListenPrefs = { rate: number; pause: number };
export const RATES = [0.8, 1, 1.2, 1.5] as const;
export const PAUSES = [3, 5, 8] as const;
const KEY = "tanto.listen.v1";

export function getListenPrefs(): ListenPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<ListenPrefs>;
    return {
      rate: RATES.includes(p.rate as (typeof RATES)[number]) ? (p.rate as number) : 1,
      pause: PAUSES.includes(p.pause as (typeof PAUSES)[number]) ? (p.pause as number) : 5,
    };
  } catch {
    return { rate: 1, pause: 5 };
  }
}

export function setListenPrefs(p: ListenPrefs): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** 日本語の声（声の一覧はあとから届くことがあるので、少し待つ）。見つからなければ null */
export function japaneseVoice(): Promise<SpeechSynthesisVoice | null> {
  const find = () => window.speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").startsWith("ja")) ?? null;
  const now = find();
  if (now || window.speechSynthesis.getVoices().length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(find());
    window.speechSynthesis.addEventListener?.("voiceschanged", done, { once: true });
    window.setTimeout(done, 1500);
  });
}

/** 読み終わるか、止められたら（signal）終わる */
export async function speak(text: string, rate: number, voice: SpeechSynthesisVoice | null, signal: AbortSignal): Promise<void> {
  for (const part of chunks(speechText(text))) {
    if (signal.aborted) return;
    await new Promise<void>((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        window.speechSynthesis.cancel();
        done();
      };
      const u = new SpeechSynthesisUtterance(part);
      u.lang = "ja-JP";
      u.rate = rate;
      if (voice) {
        try {
          u.voice = voice;
        } catch {
          // 声を選べない環境では既定の声で読む
        }
      }
      u.onend = done;
      u.onerror = done;
      signal.addEventListener("abort", onAbort);
      window.speechSynthesis.speak(u);
    });
  }
}

/** 待つ（止められたら終わる）。tick は残り秒（切り上げ）を知らせる */
export async function wait(seconds: number, signal: AbortSignal, tick?: (left: number) => void): Promise<void> {
  const end = Date.now() + seconds * 1000;
  while (!signal.aborted && Date.now() < end) {
    tick?.(Math.ceil((end - Date.now()) / 1000));
    await new Promise<void>((r) => {
      const t = window.setTimeout(r, 100);
      signal.addEventListener("abort", () => (window.clearTimeout(t), r()), { once: true });
    });
  }
}

/** 2つの signal のどちらかが止まったら止まる signal */
export function either(a: AbortSignal, b: AbortSignal): AbortSignal {
  const c = new AbortController();
  const stop = () => c.abort();
  if (a.aborted || b.aborted) stop();
  a.addEventListener("abort", stop, { once: true });
  b.addEventListener("abort", stop, { once: true });
  return c.signal;
}

/** 画面が勝手に消えないようにする（Wake Lock。使えない端末では何もしない）。解除する関数を返す */
export async function keepScreenOn(): Promise<() => void> {
  type Sentinel = { release: () => Promise<void> };
  const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
  if (!nav.wakeLock) return () => {};
  let lock: Sentinel | null = null;
  const acquire = async () => {
    try {
      lock = await nav.wakeLock!.request("screen");
    } catch {
      lock = null;
    }
  };
  // 別のアプリから戻ると解除されているので、取り直す
  const onVisible = () => document.visibilityState === "visible" && void acquire();
  await acquire();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    void lock?.release();
  };
}

// ---- 作っておいた音声の再生（T058） ----

/** 音声を作った声（pipeline/tts.py の VOICE と同じ） */
export const VOICE = "ja-JP-Chirp3-HD-Achernar";
const BASE = import.meta.env.BASE_URL;

export function audioUrl(cardId: string, part: "q" | "a"): string {
  return `${BASE}audio/tts/${VOICE}/${cardId}.${part}.mp3`;
}

/** 考える間などの無音（1・3・5・8秒。アプリに同梱）。タイマーではなく再生の終わりで次へ進むため（画面を消してもタイマーに頼らない） */
export function silenceUrl(seconds: number): string {
  return `${BASE}sounds/silence-${seconds}.mp3`;
}

export function clipUrl(name: "seikai" | "fuseikai"): string {
  return `${BASE}sounds/${name}.mp3`;
}

/**
 * el で src を流す。終わるか止められたら true、読めない（音声がない・再生できない）ときは false。
 * tick は残り秒（切り上げ）を知らせる（考える間の表示）
 */
export function play(el: HTMLAudioElement, src: string, rate: number, signal: AbortSignal, tick?: (left: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(true);
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      el.removeEventListener("timeupdate", onTime);
      signal.removeEventListener("abort", onAbort);
      resolve(ok);
    };
    const onEnded = () => done(true);
    const onError = () => done(false);
    const onAbort = () => {
      el.pause();
      done(true);
    };
    const onTime = () => {
      if (tick && Number.isFinite(el.duration)) tick(Math.max(0, Math.ceil(el.duration - el.currentTime)));
    };
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    el.addEventListener("timeupdate", onTime);
    signal.addEventListener("abort", onAbort);
    el.src = src;
    el.defaultPlaybackRate = rate;
    el.playbackRate = rate;
    el.play().catch(() => done(false));
  });
}
