import { describe, expect, it } from "vitest";
import { FLUSH_COUNT, FLUSH_DELAY_MS, HIDE_BATCH, PULL_INTERVAL_MS, SyncedStore, type Clock } from "./sync";
import { LocalStorageStore, type Answer } from "./store";
import { RateLimitedError, type ApiClient, type Report, type StoredAnswer } from "./api";
import type { AuthClient, User } from "./auth";
import { MemoryStorage } from "./test/fakes";

/** サーバーの代わり：利用者ごとの回答ログ。received_at は送られた順の連番の時刻 */
class FakeServer {
  rows = new Map<string, StoredAnswer[]>();
  offline = false;
  limited = false; // 使いすぎの制限に当たっている（429）
  deleteFails = false;
  reports: Report[] = [];
  calls: { method: "push" | "pull"; count?: number; keepalive?: boolean }[] = [];
  private t = Date.parse("2026-10-19T00:00:00.000Z");
  client(auth: AuthClient): ApiClient {
    const uid = () => {
      if (this.offline) throw new Error("offline");
      if (this.limited) throw new RateLimitedError();
      const u = auth.current();
      if (!u) throw new Error("unauthorized");
      return u.uid;
    };
    return {
      push: async (answers: Answer[], opts?: { keepalive?: boolean }) => {
        this.calls.push({ method: "push", count: answers.length, keepalive: opts?.keepalive });
        const id = uid();
        const mine = this.rows.get(id) ?? [];
        const have = new Set(mine.map((a) => a.id));
        const received_at = new Date((this.t += 1000)).toISOString();
        let inserted = 0;
        for (const a of answers) if (!have.has(a.id)) { mine.push({ ...a, received_at }); inserted++; }
        this.rows.set(id, mine);
        return { inserted, received_at };
      },
      pull: async (since?: string) => (this.calls.push({ method: "pull" }), this.rows.get(uid()) ?? []).filter((a) => !since || a.received_at > since),
      deleteMe: async () => {
        if (this.deleteFails) throw new Error("API DELETE /api/me：500");
        this.rows.delete(uid());
      },
      report: async (r: Report) => { uid(); this.reports.push(r); },
    };
  }
}

function fakeAuth(initial: User | null): AuthClient & { set(u: User | null): void; deleted: boolean; deleteFails: boolean } {
  let u = initial;
  return {
    deleted: false,
    deleteFails: false,
    async deleteAccount() {
      if (this.deleteFails) throw new Error("auth/requires-recent-login");
      this.deleted = true;
      u = null;
    },
    current: () => u,
    onChange: (cb) => { cb(u); return () => {}; },
    signIn: async () => {},
    signOut: async () => { u = null; },
    getToken: async () => (u ? `test:${u.uid}` : null),
    set: (x) => { u = x; },
  };
}

const ans = (id: string, s = "yobi-2026-minpo-q01-a", ok = true): Answer => ({ id, s, ok, at: `2026-10-19T00:00:0${id.length % 10}.000Z` });

/** 偽の時計：advance で時間を進め、期限が来たタイマーを実行する */
class FakeClock implements Clock {
  t = Date.parse("2026-10-19T09:00:00.000Z");
  private timers = new Map<number, { at: number; fn: () => void }>();
  private seq = 0;
  now() { return this.t; }
  setTimeout(fn: () => void, ms: number) { const id = ++this.seq; this.timers.set(id, { at: this.t + ms, fn }); return id; }
  clearTimeout(h: unknown) { this.timers.delete(h as number); }
  get pendingTimers() { return this.timers.size; }
  async advance(ms: number) {
    this.t += ms;
    for (const [id, x] of [...this.timers]) if (x.at <= this.t) { this.timers.delete(id); x.fn(); }
    await new Promise((r) => setTimeout(r, 0)); // 送信の完了を待つ
  }
}

function device(server: FakeServer, user: User | null, clock: Clock = new FakeClock()) {
  const storage = new MemoryStorage();
  const auth = fakeAuth(user);
  const local = new LocalStorageStore(storage);
  const store = new SyncedStore(local, server.client(auth), auth, storage, () => {}, () => !server.offline, clock);
  return { storage, auth, local, store };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("SyncedStore", () => {
  it("ログインしていなければ端末にだけ記録し、送らない", async () => {
    const server = new FakeServer();
    const d = device(server, null);
    await d.store.append(ans("1"));
    expect(await d.local.load()).toHaveLength(1);
    expect(server.rows.size).toBe(0);
    expect(d.storage.getItem("tanto.outbox.v1")).toBeNull(); // 端末に二重に持たない
  });

  it("初めてログインしたとき、端末にある記録をアカウントに引き継ぐ", async () => {
    const server = new FakeServer();
    const d = device(server, null);
    await d.store.append(ans("1"));
    await d.store.append(ans("2"));
    d.auth.set({ uid: "alice", name: "A" });
    await d.store.sync();
    expect(server.rows.get("alice")!.map((a) => a.id).sort()).toEqual(["1", "2"]);
    expect(d.store.getStatus().pending).toBe(0);
  });

  it("2台で解いた記録が、互いの端末に足し合わされる（重複しない）", async () => {
    const server = new FakeServer();
    const phone = device(server, { uid: "alice", name: "A" });
    const pc = device(server, { uid: "alice", name: "A" });
    await phone.store.append(ans("p1"));
    await pc.store.append(ans("c1"));
    await phone.store.sync();
    await pc.store.sync();
    await phone.store.sync();
    const ids = async (d: ReturnType<typeof device>) => (await d.local.load()).map((a) => a.id).sort();
    expect(await ids(phone)).toEqual(["c1", "p1"]);
    expect(await ids(pc)).toEqual(["c1", "p1"]);
    await pc.store.sync();
    expect(await ids(pc)).toEqual(["c1", "p1"]); // 何度合わせても増えない
  });

  it("オフラインで解いた記録は箱に残り、オンラインに戻ったら送られる", async () => {
    const server = new FakeServer();
    const d = device(server, { uid: "alice", name: "A" });
    server.offline = true;
    await d.store.append(ans("1"));
    await d.store.sync();
    expect(d.store.getStatus()).toMatchObject({ state: "offline", pending: 1 });
    server.offline = false;
    await d.store.sync();
    expect(d.store.getStatus()).toMatchObject({ state: "idle", pending: 0 });
    expect(server.rows.get("alice")).toHaveLength(1);
  });

  it("ログアウトすると端末の記録を消す。未送信があれば確かめ、やめたら消さない", async () => {
    const server = new FakeServer();
    const d = device(server, { uid: "alice", name: "A" });
    server.offline = true;
    await d.store.append(ans("1"));
    expect(await d.store.logout(() => false)).toBe(false);
    expect(await d.local.load()).toHaveLength(1);
    expect(await d.store.logout(() => true)).toBe(true);
    expect(await d.local.load()).toEqual([]);
    expect(d.store.getStatus()).toMatchObject({ user: null, pending: 0 });
  });

  it("別のアカウントの記録は受け取らない", async () => {
    const server = new FakeServer();
    const alice = device(server, { uid: "alice", name: "A" });
    const bob = device(server, { uid: "bob", name: "B" });
    await alice.store.append(ans("a1"));
    await alice.store.sync();
    await bob.store.sync();
    expect(await bob.local.load()).toEqual([]);
  });
});

describe("SyncedStore：送る回数を減らす（T021）", () => {
  const alice = { uid: "alice", name: "A" };

  it("回答のたびには送らず、最初の未送信から60秒たったらまとめて送る", async () => {
    const server = new FakeServer();
    const clock = new FakeClock();
    const d = device(server, alice, clock);
    await d.store.sync(); // 起動時
    server.calls = [];
    for (let i = 0; i < 5; i++) { await d.store.append(ans(`a${i}`)); await clock.advance(5000); }
    expect(server.calls).toEqual([]);
    expect(d.store.getStatus().pending).toBe(5);
    await clock.advance(FLUSH_DELAY_MS - 25000);
    expect(server.calls).toEqual([{ method: "push", count: 5, keepalive: undefined }]); // 受け取りはしない
    expect(d.store.getStatus().pending).toBe(0);
    expect(clock.pendingTimers).toBe(0);
  });

  it("未送信が30件たまったら、60秒を待たずに送る", async () => {
    const server = new FakeServer();
    const clock = new FakeClock();
    const d = device(server, alice, clock);
    await d.store.sync();
    server.calls = [];
    for (let i = 0; i < FLUSH_COUNT; i++) await d.store.append(ans(`a${i}`));
    await settle();
    expect(server.calls).toEqual([{ method: "push", count: FLUSH_COUNT, keepalive: undefined }]);
    expect(clock.pendingTimers).toBe(0); // 送ったのでタイマーは止まる
  });

  it("画面を隠したら、keepalive で送る（件数は上限まで。残りは次の機会）", async () => {
    const server = new FakeServer();
    const clock = new FakeClock();
    const d = device(server, alice, clock);
    await d.store.sync();
    server.calls = [];
    await d.store.append(ans("x"));
    await d.store.flushOnHide();
    expect(server.calls).toEqual([{ method: "push", count: 1, keepalive: true }]);
    expect(clock.pendingTimers).toBe(0);

    // 上限を超える量（ログイン前の記録の引き継ぎなど）
    d.storage.setItem("tanto.outbox.v1", JSON.stringify(Array.from({ length: HIDE_BATCH + 5 }, (_, i) => ans(`b${i}`))));
    server.calls = [];
    await d.store.flushOnHide();
    expect(server.calls).toEqual([{ method: "push", count: HIDE_BATCH, keepalive: true }]);
    expect(d.store.getStatus().pending).toBe(5);
  });

  it("画面に戻ったときは、前回の受け取りから5分以上たっていれば受け取る", async () => {
    const server = new FakeServer();
    const clock = new FakeClock();
    const phone = device(server, alice, clock);
    const pc = device(server, alice, clock);
    await phone.store.sync();
    await pc.store.append(ans("c1"));
    await pc.store.flushOnHide();
    server.calls = [];
    await clock.advance(PULL_INTERVAL_MS - 1000);
    expect(await phone.store.onVisible()).toBe(0);
    expect(server.calls).toEqual([]); // 5分たっていないので呼ばない
    await clock.advance(1000);
    expect(await phone.store.onVisible()).toBe(1);
    expect(server.calls.map((c) => c.method)).toEqual(["pull"]);
    expect((await phone.local.load()).map((a) => a.id)).toEqual(["c1"]);
  });

  it("送れなかったら箱に残し、次の機会（60秒後）に送り直す", async () => {
    const server = new FakeServer();
    const clock = new FakeClock();
    const d = device(server, alice, clock);
    await d.store.sync();
    server.offline = true;
    await d.store.append(ans("1"));
    await clock.advance(FLUSH_DELAY_MS);
    expect(d.store.getStatus()).toMatchObject({ state: "offline", pending: 1 });
    server.offline = false;
    await d.store.append(ans("2"));
    await clock.advance(FLUSH_DELAY_MS);
    expect(d.store.getStatus()).toMatchObject({ state: "idle", pending: 0 });
    expect(server.rows.get("alice")!.map((a) => a.id).sort()).toEqual(["1", "2"]);
  });

  it("30分で300肢解いても、API の呼び出しは約30回（1分に1回）に収まる", async () => {
    const server = new FakeServer();
    const clock = new FakeClock();
    const d = device(server, alice, clock);
    await d.store.sync();
    for (let i = 0; i < 300; i++) { await d.store.append(ans(`a${i}`)); await clock.advance(6000); }
    await d.store.flushOnHide();
    expect(server.rows.get("alice")).toHaveLength(300);
    expect(server.calls.length).toBeLessThanOrEqual(33); // 起動時2回＋60秒ごとに1回＋閉じるとき1回（回答ごとなら600回）
  });
});

describe("SyncedStore：退会・誤り報告・使いすぎの制限（T040）", () => {
  const user = { uid: "u1", name: "テスト" };
  const report = (id: string): Report => ({ id, target: "yobi-2026-minpo-q01-a", kind: "explanation", body: "誤り", context: "{}" });

  it("退会：サーバーの記録・アカウント・端末の記録を全部消す", async () => {
    const server = new FakeServer();
    const d = device(server, user);
    await d.store.append(ans("1"));
    await d.store.sync();
    expect(server.rows.get("u1")).toHaveLength(1);
    expect(await d.store.deleteAll()).toBe("done");
    expect(server.rows.get("u1")).toBeUndefined();
    expect(d.auth.deleted).toBe(true);
    expect(await d.local.load()).toEqual([]);
    expect(d.store.getStatus()).toMatchObject({ user: null, pending: 0 });
  });

  it("退会：サーバーの記録を消せなければ、何も消さない", async () => {
    const server = new FakeServer();
    const d = device(server, user);
    await d.store.append(ans("1"));
    server.deleteFails = true;
    expect(await d.store.deleteAll()).toBe("server-failed");
    expect(d.auth.deleted).toBe(false);
    expect(await d.local.load()).toHaveLength(1);
    expect(d.store.getStatus().user).toEqual(user);
  });

  it("退会：アカウントを消せなくても、記録は消してログアウトする", async () => {
    const server = new FakeServer();
    const d = device(server, user);
    await d.store.append(ans("1"));
    await d.store.sync();
    d.auth.deleteFails = true;
    expect(await d.store.deleteAll()).toBe("account-failed");
    expect(server.rows.get("u1")).toBeUndefined();
    expect(await d.local.load()).toEqual([]);
    expect(d.store.getStatus().user).toBeNull();
  });

  it("ログインしていなければ、この端末の記録だけ消す", async () => {
    const server = new FakeServer();
    const d = device(server, null);
    await d.store.append(ans("1"));
    expect(await d.store.deleteAll()).toBe("done");
    expect(await d.local.load()).toEqual([]);
    expect(server.calls).toEqual([]);
  });

  it("使いすぎの制限（429）に当たっても、エラーにせず箱に残して、60秒後に送り直す", async () => {
    const server = new FakeServer();
    const clock = new FakeClock();
    const d = device(server, user, clock);
    await d.store.sync();
    server.limited = true;
    for (let i = 0; i < FLUSH_COUNT; i++) await d.store.append(ans(`a${i}`));
    await settle();
    expect(d.store.getStatus()).toMatchObject({ state: "idle", pending: FLUSH_COUNT });
    expect(d.store.getStatus().message).toBeUndefined();
    server.limited = false;
    await clock.advance(FLUSH_DELAY_MS);
    await settle();
    expect(d.store.getStatus()).toMatchObject({ state: "idle", pending: 0 });
    expect(server.rows.get("u1")).toHaveLength(FLUSH_COUNT);
  });

  it("受け取りで制限に当たっても、エラーにしない", async () => {
    const server = new FakeServer();
    const d = device(server, user);
    server.limited = true;
    await d.store.sync();
    expect(d.store.getStatus().state).toBe("idle");
  });

  it("誤り報告：送れなければ端末に取っておき、次の同期のときに送る", async () => {
    const server = new FakeServer();
    const d = device(server, user);
    server.offline = true;
    await d.store.report(report("r1"));
    expect(d.store.pendingReports()).toBe(1);
    expect(d.store.getStatus().state).not.toBe("error"); // 報告の失敗は同期の表示に出さない
    server.offline = false;
    await d.store.sync();
    expect(server.reports.map((r) => r.id)).toEqual(["r1"]);
    expect(d.store.pendingReports()).toBe(0);
  });

  it("誤り報告：同じ報告を2回送っても1件", async () => {
    const server = new FakeServer();
    const d = device(server, user);
    server.offline = true;
    await d.store.report(report("r1"));
    await d.store.report(report("r1"));
    expect(d.store.pendingReports()).toBe(1);
  });
});
