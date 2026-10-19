import { useEffect, useState } from "react";
import type { AuthClient } from "./auth";
import type { SyncedStore, SyncStatus } from "./sync";

// ヘッダーの右：ログイン・ログアウトと同期の状態（T003）
export default function AuthBar({ auth, sync }: { auth: AuthClient; sync: SyncedStore }) {
  const [status, setStatus] = useState<SyncStatus>(sync.getStatus());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => sync.subscribe(setStatus), [sync]);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await auth.signIn();
      await sync.sync();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await sync.logout();
    } finally {
      setBusy(false);
    }
  }

  if (!status.user) {
    return (
      <div className="authbar">
        <button className="secondary small" disabled={busy} onClick={signIn}>
          Google でログイン
        </button>
        {error && <span className="small error">ログインできませんでした</span>}
      </div>
    );
  }
  const label =
    status.state === "syncing"
      ? "同期中…"
      : status.state === "offline"
        ? `オフライン（未送信 ${status.pending} 件）`
        : status.state === "error"
          ? `同期できませんでした（未送信 ${status.pending} 件）`
          : status.pending > 0
            ? `未送信 ${status.pending} 件`
            : "同期済み";
  return (
    <div className="authbar">
      <span className="small muted sync-status" title={status.message}>
        {status.user.name}・{label}
      </span>
      <button className="link small" disabled={busy} onClick={signOut}>
        ログアウト
      </button>
    </div>
  );
}
