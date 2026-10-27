// 肢で解くの読み上げボタン（T062）：聞き流し用に作っておいた音声（声1。なければ声2）を流す。押すともう一度で止まる。
// 画面で同時に流れるのは1つだけ（別のボタンを押すと前のを止める）。肢が変わったら止める
import { useEffect, useState } from "react";
import { audioUrls, getListenPrefs, play } from "./listen";

let current: { el: HTMLAudioElement; ctl: AbortController; owner: symbol } | null = null;

function stopCurrent() {
  current?.ctl.abort();
  current?.el.pause();
  current = null;
}

export default function SpeakButton({ cardId, part, label }: { cardId: string; part: "q" | "a"; label: string }) {
  const [me] = useState(() => Symbol(label));
  const [state, setState] = useState<"idle" | "playing" | "missing">("idle");

  // 肢が変わる・画面を離れるときは止める
  useEffect(
    () => () => {
      if (current?.owner === me) stopCurrent();
    },
    [me, cardId, part],
  );
  useEffect(() => setState("idle"), [cardId, part]);

  async function toggle() {
    if (current?.owner === me) {
      stopCurrent();
      setState("idle");
      return;
    }
    stopCurrent();
    const ctl = new AbortController();
    const el = new Audio();
    current = { el, ctl, owner: me };
    setState("playing");
    const rate = getListenPrefs().rate;
    let ok = false;
    for (const url of audioUrls(cardId, part, 1)) {
      ok = await play(el, url, rate, ctl.signal);
      if (ok || ctl.signal.aborted) break;
    }
    if (current?.owner === me) current = null;
    setState(ok || ctl.signal.aborted ? "idle" : "missing");
  }

  return (
    <button
      className="link speak-button"
      aria-label={state === "playing" ? `${label}を止める` : label}
      title={state === "missing" ? "この肢の音声はまだありません" : label}
      disabled={state === "missing"}
      onClick={() => void toggle()}
    >
      {state === "playing" ? "■" : "🔊"}
    </button>
  );
}
