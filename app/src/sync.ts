// 端末間の同期（T003・T021）。端末の回答ログ（LocalStorageStore）を正とし、サーバー（API）とは足し合わせるだけで合わせる。
// 回答ログは追記だけなので、2台で別々に解いても衝突しない（回答 ID で重複を除く）。
//
// API の呼び出しを減らすため（T021）、
// - 送る（flush）：回答のたびではなく、ためて送る。未送信が FLUSH_COUNT 件たまったとき、最初の未送信から FLUSH_DELAY_MS たったとき、
//   画面を隠したとき（flushOnHide）
// - 受け取る（pull）：起動時・ログイン時・オンライン復帰時（sync）と、画面に戻ったとき（前回から PULL_INTERVAL_MS 以上たっていれば）だけ
import type { ApiClient } from "./api";
import type { AuthClient, User } from "./auth";
import type { Answer, LocalStorageStore, RecordStore } from "./store";

const OUTBOX = "tanto.outbox.v1"; // 未送信の回答
const CURSOR = "tanto.sync.cursor.v1"; // サーバーから受け取った最後の received_at
const LINKED = "tanto.sync.user.v1"; // この端末の記録を引き継いだアカウント
const BATCH = 1000;
const OVERLAP_MS = 5 * 60 * 1000; // 受け取りの取りこぼしを防ぐため、前回の続きより少し前から取り直す（重複は除く）

export const FLUSH_COUNT = 30;
export const FLUSH_DELAY_MS = 60 * 1000;
export const PULL_INTERVAL_MS = 5 * 60 * 1000;
/** 画面を閉じるときの送信（keepalive）は本文64KBまでなので、件数を絞る（残りは次の機会に送る） */
export const HIDE_BATCH = 300;

export type SyncStatus = {
  user: User | null;
  pending: number;
  state: "idle" | "syncing" | "offline" | "error";
  lastSyncedAt: string | null;
  message?: string;
};

/** 時計（テストで差し替える） */
export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class SyncedStore implements RecordStore {
  private status: SyncStatus;
  private tail: Promise<unknown> = Promise.resolve(); // 操作を1本の列に並べ、順に実行する（重ならないように）
  private flushTimer: unknown = null;
  private lastPullAt = 0;
  private listeners = new Set<(s: SyncStatus) => void>();

  constructor(
    private readonly local: LocalStorageStore,
    private readonly api: ApiClient,
    private readonly auth: AuthClient,
    private readonly storage: Storage = localStorage,
    /** サーバーから新しい回答を受け取ったとき（学習の状態を作り直す） */
    private readonly onPulled: (count: number) => Promise<void> | void = () => {},
    private readonly isOnline: () => boolean = () => (typeof navigator === "undefined" ? true : navigator.onLine),
    private readonly clock: Clock = realClock,
  ) {
    this.status = { user: auth.current(), pending: this.outbox().length, state: "idle", lastSyncedAt: null };
  }

  load(): Promise<Answer[]> {
    return this.local.load();
  }

  /** 回答を記録する。サーバーへは、ためてまとめて送る（T021） */
  async append(answer: Answer): Promise<void> {
    await this.local.append(answer);
    // ログインしていないときは未送信の箱に入れない（端末に二重に持たないため）。
    // 初めてログインしたときに、端末の記録を全部アカウントに送る（sync の引き継ぎ）
    if (!this.auth.current()) return;
    const box = [...this.outbox(), answer];
    this.setOutbox(box);
    if (box.length >= FLUSH_COUNT) {
      void this.flush();
    } else if (this.flushTimer === null) {
      this.flushTimer = this.clock.setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, FLUSH_DELAY_MS);
    }
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(cb: (s: SyncStatus) => void): () => void {
    this.listeners.add(cb);
    cb(this.status);
    return () => this.listeners.delete(cb);
  }

  /** 送って、受け取る（起動時・ログイン時・オンライン復帰時）。受け取った新しい回答の数を返す */
  sync(): Promise<number> {
    return this.enqueue(async () => {
      if (!(await this.flushOnce())) return 0;
      return this.pullOnce();
    });
  }

  /** 送るだけ（受け取らない） */
  flush(): Promise<void> {
    return this.enqueue(async () => {
      await this.flushOnce();
    });
  }

  /** 画面を隠したとき（別のアプリに切り替えた・閉じる）：ページが閉じても送信が続く方法で送る */
  flushOnHide(): Promise<void> {
    return this.enqueue(async () => {
      await this.flushOnce({ keepalive: true, limit: HIDE_BATCH });
    });
  }

  /** 画面に戻ったとき：前回の受け取りから PULL_INTERVAL_MS 以上たっていれば、送って受け取る */
  async onVisible(): Promise<number> {
    if (this.clock.now() - this.lastPullAt < PULL_INTERVAL_MS) return 0;
    return this.sync();
  }

  /**
   * ログアウト。その端末の記録を消す（共有の端末への配慮）。
   * 未送信が残っているときは、まず送ってみて、送れなければ confirm で確かめる。消さずにやめたら false
   */
  async logout(confirm: (message: string) => boolean = (m) => window.confirm(m)): Promise<boolean> {
    if (this.outbox().length > 0) await this.flush();
    const pending = this.outbox().length;
    if (pending > 0 && !confirm(`まだサーバーに送れていない回答が ${pending} 件あります。ログアウトすると、この端末からは消えます。ログアウトしますか？`)) {
      return false;
    }
    this.cancelTimer();
    await this.auth.signOut();
    await this.local.clear();
    for (const k of [OUTBOX, CURSOR, LINKED]) this.storage.removeItem(k);
    this.lastPullAt = 0;
    this.update({ user: null, pending: 0, state: "idle", lastSyncedAt: null, message: undefined });
    await this.onPulled(0);
    return true;
  }

  /** 操作を列に並べる。呼んだ時点より後に始まる処理を必ず1回行う（終わりかけの処理に相乗りしない） */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** 未送信を送る。ログインしていなければ何もしない。送り切れたら true */
  private async flushOnce(opts: { keepalive?: boolean; limit?: number } = {}): Promise<boolean> {
    const user = this.auth.current();
    this.update({ user, pending: this.outbox().length });
    if (!user) return false;
    this.cancelTimer();
    this.update({ state: "syncing", message: undefined });
    try {
      // 初めてこのアカウントでログインした端末：端末にある記録を全部アカウントに引き継ぐ（サーバーは重複を無視する）
      if (this.storage.getItem(LINKED) !== user.uid) {
        const all = await this.local.load();
        const have = new Set(this.outbox().map((a) => a.id));
        this.setOutbox([...this.outbox(), ...all.filter((a) => !have.has(a.id))]);
        this.storage.setItem(LINKED, user.uid);
        this.storage.removeItem(CURSOR);
      }
      const limit = opts.limit ?? Number.POSITIVE_INFINITY;
      let sentTotal = 0;
      for (let box = this.outbox(); box.length > 0 && sentTotal < limit; box = this.outbox()) {
        const batch = box.slice(0, Math.min(BATCH, limit - sentTotal));
        await this.api.push(batch, { keepalive: opts.keepalive });
        const sent = new Set(batch.map((a) => a.id));
        this.setOutbox(this.outbox().filter((a) => !sent.has(a.id)));
        sentTotal += batch.length;
      }
      this.update({ state: "idle", lastSyncedAt: new Date(this.clock.now()).toISOString() });
      return this.outbox().length === 0;
    } catch (e) {
      this.update({ state: this.isOnline() ? "error" : "offline", message: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      this.update({ pending: this.outbox().length });
    }
  }

  /** サーバーから前回以降の分を受け取り、端末のログに足す。受け取った新しい回答の数を返す */
  private async pullOnce(): Promise<number> {
    if (!this.auth.current()) return 0;
    this.update({ state: "syncing" });
    try {
      const cursor = this.storage.getItem(CURSOR);
      const since = cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : undefined;
      const pulled = await this.api.pull(since);
      const have = new Set((await this.local.load()).map((a) => a.id));
      const news = pulled.filter((a) => !have.has(a.id)).map(({ id, s, ok, at }) => ({ id, s, ok, at }));
      if (news.length > 0) await this.local.appendMany(news);
      const maxReceived = pulled.reduce((m, a) => (a.received_at > m ? a.received_at : m), cursor ?? "");
      if (maxReceived) this.storage.setItem(CURSOR, maxReceived);
      this.lastPullAt = this.clock.now();
      this.update({ state: "idle", lastSyncedAt: new Date(this.clock.now()).toISOString() });
      if (news.length > 0) await this.onPulled(news.length);
      return news.length;
    } catch (e) {
      this.update({ state: this.isOnline() ? "error" : "offline", message: e instanceof Error ? e.message : String(e) });
      return 0;
    }
  }

  private cancelTimer(): void {
    if (this.flushTimer !== null) {
      this.clock.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
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
