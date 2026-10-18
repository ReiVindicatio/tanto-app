import { describe, expect, it } from "vitest";
import { LocalStorageStore } from "./store";
import { MemoryStorage } from "./test/fakes";

describe("LocalStorageStore", () => {
  it("追記した回答を読み直せる", async () => {
    const st = new LocalStorageStore(new MemoryStorage());
    await st.append({ id: "1", s: "yobi-2026-minpo-q01-a", ok: true, at: "2026-10-01T00:00:00.000Z" });
    await st.append({ id: "2", s: "yobi-2026-minpo-q01-b", ok: false, at: "2026-10-01T00:01:00.000Z" });
    expect((await st.load()).map((a) => a.id)).toEqual(["1", "2"]);
  });

  it("旧形式の集計を、肢ごとに1件の回答ログに変換し、旧キーを tanto.legacy.* に退避する", async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "tanto.history.v1",
      JSON.stringify({
        "yobi-2026-minpo-q01-b": { attempts: 1, correct: 0, last: false, at: "2026-10-02T00:00:00.000Z" },
        "yobi-2026-minpo-q01-a": { attempts: 3, correct: 2, last: true, at: "2026-10-01T00:00:00.000Z" },
      }),
    );
    storage.setItem("tanto.srs.v1", "{}");
    storage.setItem("tanto.srs.new.v2", "{}");
    const log = await new LocalStorageStore(storage).load();
    expect(log.map((a) => `${a.s}:${a.ok}`)).toEqual(["yobi-2026-minpo-q01-a:true", "yobi-2026-minpo-q01-b:false"]);
    expect(storage.getItem("tanto.history.v1")).toBeNull();
    expect(storage.getItem("tanto.legacy.history.v1")).not.toBeNull();
    expect(storage.getItem("tanto.legacy.srs.v1")).toBe("{}");
    expect(JSON.parse(storage.getItem("tanto.log.v1")!)).toHaveLength(2);
  });

  it("何もない状態では空のログになる", async () => {
    expect(await new LocalStorageStore(new MemoryStorage()).load()).toEqual([]);
  });
});
