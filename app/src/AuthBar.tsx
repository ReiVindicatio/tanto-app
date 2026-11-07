import { useEffect, useState } from "react";
import type { AuthClient } from "./auth";
import { AdminBadge } from "./AdminBadge";
import { inEarlyAccess } from "./earlyAccess";
import type { DeleteResult, SyncedStore, SyncStatus } from "./sync";

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

/** ログイン・ログアウトと同期の状態（T003・T025）。ログインしていないときはマイページの一番上（top）に出し、ログイン中は設定のアカウント欄に出す（T071） */
export default function AuthPanel({ auth, sync, top = false }: { auth: AuthClient; sync: SyncedStore; top?: boolean }) {
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

  if (top && status.user) return null;
  if (!status.user) {
    if (!top) return <p className="small muted">ログインしていません。ログインは、このページの一番上からできます。</p>;
    return (
      <div className="card authbar">
        <p className="small muted">ログインすると、スマホと PC で学習の記録を共有できます。ログインしなくても、この端末で使えます。</p>
        {/* ベータ版の特典（T074） */}
        {inEarlyAccess(new Date()) && <p className="small early-access">ベータ版の間にログインすると、特別な衣装「星詠みの裁定者」をずっと着られます。</p>}
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
        <AdminBadge />
        <span className="small muted account-sync">　{statusLabel(status)}</span>
      </div>
      <button className="secondary" disabled={busy} onClick={signOut}>
        ログアウト
      </button>
    </div>
  );
}

const DELETE_MESSAGE: Record<DeleteResult, string> = {
  done: "記録を全部消しました。",
  "server-failed": "通信できませんでした。何も消していません。しばらくしてからもう一度お試しください。",
  "account-failed": "記録は消しました。アカウントの削除はできませんでした。もう一度ログインして、お試しください。",
};

/** 記録を全部消す（退会：T040）。件数を見せてから、2回確かめて消す */
export function DeleteData({ sync, confirm = (m) => window.confirm(m) }: { sync: SyncedStore; confirm?: (message: string) => boolean }) {
  const status = useSyncStatus(sync);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeleteResult | null>(null);
  const loggedIn = !!status.user;

  async function openPanel() {
    setResult(null);
    setCount((await sync.load()).length);
    setOpen(true);
  }

  async function run() {
    if (!confirm(loggedIn ? "本当にアカウントと記録を全部消しますか？元に戻せません。" : "本当にこの端末の記録を消しますか？元に戻せません。")) return;
    setBusy(true);
    try {
      const r = await sync.deleteAll();
      setResult(r);
      if (r !== "server-failed") setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="delete-data">
      {result && <p className={`small ${result === "done" ? "muted" : "error"}`}>{DELETE_MESSAGE[result]}</p>}
      {!open ? (
        <button className="link small danger" onClick={() => void openPanel()}>
          {loggedIn ? "記録を全部消す（退会）" : "この端末の記録を消す"}
        </button>
      ) : (
        <div className="card delete-confirm">
          <p className="small">
            {loggedIn
              ? `回答 ${count?.toLocaleString() ?? "…"} 件の記録を、サーバーとこの端末から消し、ログインのアカウントも消します。元に戻せません。`
              : `この端末の回答 ${count?.toLocaleString() ?? "…"} 件の記録を消します。元に戻せません。`}
          </p>
          {loggedIn && <p className="muted small">送っていただいた誤り報告は、送った人が分からない形で残ります。</p>}
          <div className="row">
            <button className="secondary" disabled={busy} onClick={() => setOpen(false)}>
              やめる
            </button>
            <button className="danger" disabled={busy} onClick={() => void run()}>
              消す
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
