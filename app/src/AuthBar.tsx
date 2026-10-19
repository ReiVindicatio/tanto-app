import { useEffect, useState } from "react";
import type { AuthClient } from "./auth";
import type { SyncedStore, SyncStatus } from "./sync";

function useSyncStatus(sync: SyncedStore): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(sync.getStatus());
  useEffect(() => sync.subscribe(setStatus), [sync]);
  return status;
}

function statusLabel(status: SyncStatus): string {
  return status.state === "syncing"
    ? "同期中…"
    : status.state === "offline"
      ? `オフライン（未送信 ${status.pending} 件）`
      : status.state === "error"
        ? `同期できませんでした（未送信 ${status.pending} 件）`
        : status.pending > 0
          ? `未送信 ${status.pending} 件`
          : "同期済み";
}

/** ヘッダーの右：ログイン中なら同期の状態だけを出す（T025。ログイン・ログアウトはマイページ） */
export function SyncBadge({ sync }: { sync: SyncedStore }) {
  const status = useSyncStatus(sync);
  if (!status.user) return null;
  return (
    <span className={`small sync-status state-${status.state}`} title={status.message}>
      {statusLabel(status)}
    </span>
  );
}

/** マイページのアカウント欄：ログイン・ログアウトと同期の状態（T003・T025） */
export default function AuthPanel({ auth, sync }: { auth: AuthClient; sync: SyncedStore }) {
  const status = useSyncStatus(sync);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <p className="small muted">ログインすると、スマホと PC で学習の記録を共有できます。ログインしなくても、この端末で使えます。</p>
        <button disabled={busy} onClick={signIn}>
          Google でログイン
        </button>
        {error && <p className="small error">ログインできませんでした</p>}
      </div>
    );
  }
  return (
    <div className="authbar">
      <div>
        <strong>{status.user.name}</strong>
        <span className="small muted account-sync">　{statusLabel(status)}</span>
      </div>
      <button className="secondary" disabled={busy} onClick={signOut}>
        ログアウト
      </button>
    </div>
  );
}
