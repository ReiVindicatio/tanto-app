// お試しの画面（T070）：残り数の行、終わりの画面、衣装の一覧のボタン。状態は trial.ts
import { useEffect, useState } from "react";
import { characterImage } from "../character";
import { navigate, useRoute } from "../router";
import { lineText, pickLine, playLine, type Line } from "./lines";
import { playMove } from "./special";
import { currentTheme, setTheme, themeById } from "./themes";
import { closeTrial, forgetTrial, openTrial, setWanted, trialAccount, trialOver, trialState, TRIAL_ANSWERS, TRIAL_THEME, useTrial, wanted } from "./trial";

/** 解いている途中や、お披露目の途中では切らない */
const KEEP_ON = ["play", "article", "reveal"];

let ending: { theme: string; line?: Line } | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

/** お試しを始める。勝手に着替えるときも、一覧のボタンからもここを通る */
export async function startTrial(): Promise<boolean> {
  const r = await openTrial(currentTheme(Infinity));
  if (r !== "started") return false;
  setTheme(TRIAL_THEME);
  playMove(TRIAL_THEME, "entrance");
  return true;
}

/** お試しを終える。元の服に戻して、終わりの画面を出す */
export function finishTrial(): void {
  const t = trialState();
  if (t.status !== "on") return;
  closeTrial(t.theme);
  const line = pickLine(`tryon_${t.theme}`, Infinity);
  if (line) playLine(line);
  setTheme(t.prev === t.theme ? "default" : t.prev);
  ending = { theme: t.theme, line };
  changed();
}

/** ログアウトした：終わりの画面は出さず、元の服に戻して通行証を消す */
function dropTrial(): void {
  const t = trialState();
  if (t.status !== "on") return;
  forgetTrial();
  setTheme(t.prev === t.theme ? "default" : t.prev);
  void fetch("/special/logout", { method: "POST" }).catch(() => {});
}

/** App の一番外に1つ置く */
export function TrialLayer() {
  const t = useTrial();
  const route = useRoute();
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    const clock = window.setInterval(f, 15000); // 48時間の期限
    return () => {
      listeners.delete(f);
      window.clearInterval(clock);
    };
  }, []);
  const account = trialAccount();
  const over = trialOver(t);
  const keep = KEEP_ON.includes(route.name);
  useEffect(() => {
    if (t.status !== "on") return;
    if (account === "out") dropTrial();
    else if (over && !keep) finishTrial();
  }, [t.status, account, over, keep]);

  if (ending) {
    const close = () => {
      ending = null;
      changed();
    };
    return <TrialEnd theme={ending.theme} line={ending.line} onClose={close} />;
  }
  return null;
}

function TrialEnd({ theme, line, onClose }: { theme: string; line?: Line; onClose: () => void }) {
  const t = themeById(theme);
  return (
    <div className="trial-end" role="dialog" aria-label="お試しのおわり">
      <div className="trial-end-card">
        <img src={characterImage("base", "smile", theme)} alt="" />
        <strong>{t?.name}のお試しはここまで</strong>
        {line && <p>「{lineText(line)}」</p>}
        <p className="muted small">販売の準備中です。また着たいと思ったら「欲しい」を押してください。</p>
        <WantButton theme={theme} />
        <button className="link" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

/** 残り数の行（上の欄の下）。上の欄は幅に余裕がないので、1行を分ける。押すと終えられる */
export function TrialBar() {
  const t = useTrial();
  if (t.status !== "on") return null;
  return (
    <div className="trial-bar">
      <span>{themeById(t.theme)?.name}のお試し　あと{t.left}問</span>
      <button
        className="link"
        onClick={() => {
          if (window.confirm("お試しを終えて、元の服に戻しますか？ お試しは1回だけです。")) finishTrial();
        }}
      >
        元の服に戻す
      </button>
    </div>
  );
}

/** 「欲しい」。ログインしていなければ出さない（押した人を数えられない） */
export function WantButton({ theme }: { theme: string }) {
  useTrial();
  const [failed, setFailed] = useState(false);
  if (trialAccount() !== "in") return null;
  const on = wanted(theme);
  return (
    <>
      <button
        className={`secondary want-button${on ? " chosen" : ""}`}
        aria-pressed={on}
        onClick={() => {
          void setWanted(theme, !on).then((ok) => setFailed(!ok));
        }}
      >
        {on ? "♥ 欲しい（押しました）" : "♡ 欲しい"}
      </button>
      {failed && <span className="muted small">送れませんでした。通信を確かめてください</span>}
    </>
  );
}

/** 衣装の一覧の、見本の1着のボタン */
export function TrialButton({ onStart }: { onStart: () => void }) {
  const t = useTrial();
  const [failed, setFailed] = useState(false);
  const account = trialAccount();
  if (t.status === "done") return <span className="muted small">お試しは終わりました</span>;
  if (t.status === "on") return null;
  if (account !== "in") {
    return (
      <button className="link" onClick={() => navigate({ name: "me" })}>
        ログインすると{TRIAL_ANSWERS}問だけ試せます
      </button>
    );
  }
  return (
    <>
      <button
        onClick={() => {
          void startTrial().then((ok) => {
            setFailed(!ok);
            if (ok) onStart();
          });
        }}
      >
        {TRIAL_ANSWERS}問だけ試す（1回）
      </button>
      {failed && trialState().status === "none" && <span className="muted small">始められませんでした。通信を確かめてください</span>}
    </>
  );
}
