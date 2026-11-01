// 管理者（T068）：衣装を全部開いて動作を確かめるため。判定はサーバー（/api/me。管理者のメールは Worker の秘密の設定）。
// ここに覚えるのは結果だけ。端末の値を書き換えれば見た目は開くが、今は課金がないので問題ない（課金を入れるときは、絵の配信をサーバー側で守る）
import { useEffect, useState } from "react";

const KEY = "tanto.admin.v1";
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

export function isAdmin(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** ログイン状態が変わったら呼ぶ。ログインしていなければ外し、通信に失敗したら今の値のまま */
export async function refreshAdmin(getToken: () => Promise<string | null>, doFetch: typeof fetch = fetch): Promise<void> {
  try {
    const token = await getToken();
    if (!token) {
      if (isAdmin()) void doFetch("/special/logout", { method: "POST" }); // 特別な衣装の通行証（T069）を消す
      localStorage.removeItem(KEY);
      changed();
      return;
    }
    const r = await doFetch("/api/me", { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const { admin } = (await r.json()) as { admin?: boolean };
    if (admin) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
    changed();
  } catch {
    // 通信できなければ、今の値のまま
  }
}
