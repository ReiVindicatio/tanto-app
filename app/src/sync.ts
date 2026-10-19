// 端末間の同期（T003）。端末の回答ログ（LocalStorageStore）を正とし、サーバー（API）とは足し合わせるだけで合わせる。
// 回答ログは追記だけなので、2台で別々に解いても衝突しない（回答 ID で重複を除く）。
import type { ApiClient } from "./api";
import type { AuthClient, User } from "./auth";
import type { Answer, LocalStorageStore, RecordStore } from "./store";

const OUTBOX = "tanto.outbox.v1"; // 未送信の回答
const CURSOR = "tanto.sync.cursor.v1"; // サーバーから受け取った最後の received_at
const LINKED = "tanto.sync.user.v1"; // この端末の記録を引き継いだアカウント
const BATCH = 1000;
const OVERLAP_MS = 5 * 60 * 1000; // 受け取りの取りこぼしを防ぐため、前回の続きより少し前から取り直す（重複は除く）

export type SyncStatus = {
  user: User | null;
  pending: number;
  state: "idle" | "syncing" | "offline" | "error";
  lastSyncedAt: string | null;
  message?: string;
};

export class SyncedStore implements RecordStore {
  private status: SyncStatus;
  private running: Promise<number> | null = null; // 実行中の同期
  private queued: Promise<number> | null = null; // 実行中に呼ばれたときに予約した、次の同期
  private listeners = new Set<(s: SyncStatus) => void>();

  constructor(
    private readonly local: LocalStorageStore,
    private readonly api: ApiClient,
    private readonly auth: AuthClient,
    private readonly storage: Storage = localStorage,
    /** サーバーから新しい回答を受け取ったとき（学習の状態を作り直す） */
    private readonly onPulled: (count: number) => Promise<void> | void = () => {},
    private readonly isOnline: () => boolean = () => (typeof navigator === "undefined" ? true : navigator.onLine),
  ) {
    this.status = { user: auth.current(), pending: this.outbox().length, state: "idle", lastSyncedAt: null };
  }

  load(): Promise<Answer[]> {
    return this.local.load();
  }

  async append(answer: Answer): Promise<void> {
    await this.local.append(answer);
    // ログインしていないときは未送信の箱に入れない（端末に二重に持たないため）。
    // 初めてログインしたときに、端末の記録を全部アカウントに送る（sync の引き継ぎ）
    if (!this.auth.current()) return;
    this.setOutbox([...this.outbox(), answer]);
    void this.sync();
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(cb: (s: SyncStatus) => void): () => void {
    this.listeners.add(cb);
    cb(this.status);
    return () => this.listeners.delete(cb);
  }

  /**
   * 未送信を送り、サーバーから前回以降の分を受け取る。受け取った新しい回答の数を返す。
   * 呼んだ時点より後に始まる同期を必ず1回行う：実行中なら次の1回を予約し（予約があればそれに相乗りする）、
   * 実行中の同期が終わってから始める（終わりかけの同期に相乗りして、ログイン直後の分を取りこぼさないように）
   */
  sync(): Promise<number> {
    if (!this.running) {
      this.running = this.syncOnce().finally(() => {
        this.running = null;
      });
      return this.running;
    }
    if (!this.queued) {
      this.queued = this.running
        .catch(() => 0)
        .then(() => {
          this.queued = null;
          return this.sync();
        });
    }
    return this.queued;
  }

  private async syncOnce(): Promise<number> {
    const user = this.auth.current();
    this.update({ user, pending: this.outbox().length });
    if (!user) return 0;
    this.update({ state: "syncing", message: undefined });
    let fresh = 0;
    try {
      // 初めてこのアカウントでログインした端末：端末にある記録を全部アカウントに引き継ぐ（サーバーは重複を無視する）
      if (this.storage.getItem(LINKED) !== user.uid) {
        const all = await this.local.load();
        const have = new Set(this.outbox().map((a) => a.id));
        this.setOutbox([...this.outbox(), ...all.filter((a) => !have.has(a.id))]);
        this.storage.setItem(LINKED, user.uid);
        this.storage.removeItem(CURSOR);
      }
      // 送る
      for (let box = this.outbox(); box.length > 0; box = this.outbox()) {
        const batch = box.slice(0, BATCH);
        await this.api.push(batch);
        const sent = new Set(batch.map((a) => a.id));
        this.setOutbox(this.outbox().filter((a) => !sent.has(a.id)));
      }
      // 受け取る
      const cursor = this.storage.getItem(CURSOR);
      const since = cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : undefined;
      const pulled = await this.api.pull(since);
      const have = new Set((await this.local.load()).map((a) => a.id));
      const news = pulled.filter((a) => !have.has(a.id)).map(({ id, s, ok, at }) => ({ id, s, ok, at }));
      if (news.length > 0) await this.local.appendMany(news);
      const maxReceived = pulled.reduce((m, a) => (a.received_at > m ? a.received_at : m), cursor ?? "");
      if (maxReceived) this.storage.setItem(CURSOR, maxReceived);
      fresh = news.length;
      this.update({ state: "idle", lastSyncedAt: new Date().toISOString() });
      if (fresh > 0) await this.onPulled(fresh);
    } catch (e) {
      this.update({ state: this.isOnline() ? "error" : "offline", message: e instanceof Error ? e.message : String(e) });
    } finally {
      this.update({ pending: this.outbox().length });
    }
    return fresh;
  }

  /**
   * ログアウト。その端末の記録を消す（共有の端末への配慮）。
   * 未送信が残っているときは、まず送ってみて、送れなければ confirm で確かめる。消さずにやめたら false
   */
  async logout(confirm: (message: string) => boolean = (m) => window.confirm(m)): Promise<boolean> {
    if (this.outbox().length > 0) await this.sync();
    const pending = this.outbox().length;
    if (pending > 0 && !confirm(`まだサーバーに送れていない回答が ${pending} 件あります。ログアウトすると、この端末からは消えます。ログアウトしますか？`)) {
      return false;
    }
    await this.auth.signOut();
    await this.local.clear();
    for (const k of [OUTBOX, CURSOR, LINKED]) this.storage.removeItem(k);
    this.update({ user: null, pending: 0, state: "idle", lastSyncedAt: null, message: undefined });
    await this.onPulled(0);
    return true;
  }

  private outbox(): Answer[] {
    try {
      return JSON.parse(this.storage.getItem(OUTBOX) ?? "[]") as Answer[];
    } catch {
      return [];
    }
  }

  private setOutbox(box: Answer[]): void {
    this.storage.setItem(OUTBOX, JSON.stringify(box));
    this.update({ pending: box.length });
  }

  private update(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((cb) => cb(this.status));
  }
}
