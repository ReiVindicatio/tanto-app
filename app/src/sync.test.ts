import { describe, expect, it } from "vitest";
import { SyncedStore } from "./sync";
import { LocalStorageStore, type Answer } from "./store";
import type { ApiClient, StoredAnswer } from "./api";
import type { AuthClient, User } from "./auth";
import { MemoryStorage } from "./test/fakes";

/** サーバーの代わり：利用者ごとの回答ログ。received_at は送られた順の連番の時刻 */
class FakeServer {
  rows = new Map<string, StoredAnswer[]>();
  offline = false;
  private t = Date.parse("2026-10-19T00:00:00.000Z");
  client(auth: AuthClient): ApiClient {
    const uid = () => {
      if (this.offline) throw new Error("offline");
      const u = auth.current();
      if (!u) throw new Error("unauthorized");
      return u.uid;
    };
    return {
      push: async (answers: Answer[]) => {
        const id = uid();
        const mine = this.rows.get(id) ?? [];
        const have = new Set(mine.map((a) => a.id));
        const received_at = new Date((this.t += 1000)).toISOString();
        let inserted = 0;
        for (const a of answers) if (!have.has(a.id)) { mine.push({ ...a, received_at }); inserted++; }
        this.rows.set(id, mine);
        return { inserted, received_at };
      },
      pull: async (since?: string) => (this.rows.get(uid()) ?? []).filter((a) => !since || a.received_at > since),
      deleteMe: async () => { this.rows.delete(uid()); },
    };
  }
}

function fakeAuth(initial: User | null): AuthClient & { set(u: User | null): void } {
  let u = initial;
  return {
    current: () => u,
    onChange: (cb) => { cb(u); return () => {}; },
    signIn: async () => {},
    signOut: async () => { u = null; },
    getToken: async () => (u ? `test:${u.uid}` : null),
    set: (x) => { u = x; },
  };
}

const ans = (id: string, s = "yobi-2026-minpo-q01-a", ok = true): Answer => ({ id, s, ok, at: `2026-10-19T00:00:0${id.length % 10}.000Z` });

function device(server: FakeServer, user: User | null) {
  const storage = new MemoryStorage();
  const auth = fakeAuth(user);
  const local = new LocalStorageStore(storage);
  const store = new SyncedStore(local, server.client(auth), auth, storage, () => {}, () => !server.offline);
  return { storage, auth, local, store };
}

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
