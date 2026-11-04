// 特別な衣装のお試し（T070）：見本の1着（TRIAL_THEME）を、1人1回、20問か48時間だけ着られる。残りの衣装は買うまで全身の絵1枚だけ（docs/decisions/026）。
// 回数の制限と絵の配信はサーバー（worker/special.ts）が守る。端末の値を書き換えても、ほかの衣装の絵は届かず、見本も48時間で切れる
import { useEffect, useState } from "react";

export const TRIAL_THEME = "hoshiyomi";
/** 勝手に着替わるレベル。ここに届いたあと、次にホームへ戻ったときに始まる */
export const TRIAL_LEVEL = 5;
export const TRIAL_ANSWERS = 20;

export type TrialState =
  | { status: "none" }
  | { status: "on"; theme: string; prev: string; left: number; until: number }
  | { status: "done"; theme: string };

const KEY = "tanto.special.trial.v2";
const WANT_KEY = "tanto.special.want.v1";
const INVITE_KEY = "tanto.special.trial.invite.v1";

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

let account: "unknown" | "in" | "out" = "unknown";
let tokenOf: () => Promise<string | null> = async () => null;
let opening = false;

/** ログイン状態が変わったら呼ぶ */
export function setTrialAccount(getToken: () => Promise<string | null>, signedIn: boolean): void {
  tokenOf = getToken;
  account = signedIn ? "in" : "out";
  changed();
}

export function trialAccount(): "unknown" | "in" | "out" {
  return account;
}

export function trialState(): TrialState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as TrialState | null;
    return v && (v.status === "on" || v.status === "done") ? v : { status: "none" };
  } catch {
    return { status: "none" };
  }
}

function save(v: TrialState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // 覚えられなければ、次に開いたときに「お試し前」に戻る（回数はサーバーが数えている）
  }
  changed();
}

/** その衣装をお試し中か（themes.ts の isUnlocked から見る） */
export function inTrial(id: string): boolean {
  const t = trialState();
  return t.status === "on" && t.theme === id;
}

/** 回数か期限を使い切ったか。解いている途中では切らないので、切るのは画面の側 */
export function trialOver(t: TrialState, now = Date.now()): boolean {
  return t.status === "on" && (t.left <= 0 || t.until <= now);
}

/** 肢や問に1つ答えたら呼ぶ */
export function trialAnswered(): void {
  const t = trialState();
  if (t.status === "on" && t.left > 0) save({ ...t, left: t.left - 1 });
}

/** お試しの記録をつける。サーバーが1回使い切りと答えたら done にする。通信できなければ何も変えない（次の機会にもう一度） */
export async function openTrial(prev: string, doFetch: typeof fetch = fetch): Promise<"started" | "used" | "failed"> {
  if (opening) return "failed";
  opening = true;
  try {
    const token = await tokenOf();
    if (!token) return "failed";
    const r = await doFetch("/api/special/trial", { method: "POST", headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) return "failed";
    const v = (await r.json()) as { available?: boolean; costume?: string; until?: string };
    if (!v.available || !v.costume || !v.until) {
      save({ status: "done", theme: TRIAL_THEME });
      return "used";
    }
    save({ status: "on", theme: v.costume, prev, left: TRIAL_ANSWERS, until: Date.parse(v.until) });
    return "started";
  } catch {
    return "failed";
  } finally {
    opening = false;
  }
}

export function closeTrial(theme: string): void {
  save({ status: "done", theme });
}

/** ログアウトで呼ぶ。次にログインした人のお試しを使わせないよう、端末の印を空にする */
export function forgetTrial(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 消せなくても、サーバーが1人1回を数えている
  }
  changed();
}

// ---- 「欲しい」：買えるようになる前に、衣装ごとの人気を見る ----

function wantList(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(WANT_KEY) ?? "[]");
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

export function wanted(id: string): boolean {
  return wantList().includes(id);
}

/** サーバーに届いたら端末にも覚える。false＝届かなかった */
export async function setWanted(id: string, want: boolean, doFetch: typeof fetch = fetch): Promise<boolean> {
  try {
    const token = await tokenOf();
    if (!token) return false;
    const r = await doFetch("/api/special/want", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ costume: id, want }) });
    if (!r.ok) return false;
    localStorage.setItem(WANT_KEY, JSON.stringify(want ? [...new Set([...wantList(), id])] : wantList().filter((x) => x !== id)));
    changed();
    return true;
  } catch {
    return false;
  }
}

// ---- ログインしていない人への案内：1回閉じたら出さない ----

export function trialInviteClosed(): boolean {
  try {
    return localStorage.getItem(INVITE_KEY) === "1";
  } catch {
    return true;
  }
}

export function closeTrialInvite(): void {
  try {
    localStorage.setItem(INVITE_KEY, "1");
  } catch {
    // 覚えられなければ、また出る
  }
  changed();
}

/** お試しの状態・ログイン状態が変わったら描き直す */
export function useTrial(): TrialState {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return trialState();
}
