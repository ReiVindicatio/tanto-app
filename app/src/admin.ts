// 管理者（T068）：衣装を全部開いて動作を確かめるため。判定はサーバー（/api/me。管理者のメールは Worker の秘密の設定）。
// ここに覚えるのは結果だけ。端末の値を書き換えれば見た目は開くが、今は課金がないので問題ない（課金を入れるときは、絵の配信をサーバー側で守る）
import { useEffect, useState } from "react";

const KEY = "tanto.admin.v1";
const AS_USER = "tanto.admin.asuser.v1";
/** 持っている特別な衣装（T074。/api/me が返す）。絵はサーバーが通行証で守るので、ここを書き換えても届かない */
const OWNED = "tanto.special.owned.v1";
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

/** 管理者か（判定が届いたら画面に反映する） */
export function useAdmin(): boolean {
  const [v, setV] = useState(isAdmin);
  useEffect(() => {
    const f = () => setV(isAdmin());
    listeners.add(f);
    f();
    return () => {
      listeners.delete(f);
    };
  }, []);
  return v;
}

/** 管理者の表示か。一般の見え方に切り替えている間は、管理者でも false */
export function isAdmin(): boolean {
  return isRealAdmin() && !asUser();
}

/** サーバーが管理者と判定したか（表示の切り替えに関係なく） */
export function isRealAdmin(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** 管理者が、一般の人の見え方を確かめているか */
export function asUser(): boolean {
  try {
    return localStorage.getItem(AS_USER) === "1";
  } catch {
    return false;
  }
}

export function setAsUser(on: boolean): void {
  try {
    if (on) localStorage.setItem(AS_USER, "1");
    else localStorage.removeItem(AS_USER);
  } catch {
    // 覚えられなければ切り替わらない
  }
  changed();
}

/** 管理者の印を出すか（一般の見え方の間も出して、戻せるようにする） */
export function useRealAdmin(): boolean {
  const [v, setV] = useState(isRealAdmin);
  useEffect(() => {
    const f = () => setV(isRealAdmin());
    listeners.add(f);
    f();
    return () => {
      listeners.delete(f);
    };
  }, []);
  return v;
}

export function ownedList(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(OWNED) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** その特別な衣装を持っているか（T074） */
export function isOwned(id: string): boolean {
  return ownedList().includes(id);
}

/** ログイン状態が変わったら呼ぶ。ログインしていなければ外し、通信に失敗したら今の値のまま */
export async function refreshAdmin(getToken: () => Promise<string | null>, doFetch: typeof fetch = fetch): Promise<void> {
  try {
    const token = await getToken();
    if (!token) {
      if (isRealAdmin() || ownedList().length) void doFetch("/special/logout", { method: "POST" }); // 特別な衣装の通行証（T069・T074）を消す
      localStorage.removeItem(KEY);
      localStorage.removeItem(OWNED);
      changed();
      return;
    }
    const r = await doFetch("/api/me", { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const { admin, owned } = (await r.json()) as { admin?: boolean; owned?: unknown };
    if (admin) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
    localStorage.setItem(OWNED, JSON.stringify(Array.isArray(owned) ? owned.filter((x) => typeof x === "string") : []));
    changed();
  } catch {
    // 通信できなければ、今の値のまま
  }
}
