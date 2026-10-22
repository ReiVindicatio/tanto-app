import { describe, expect, it } from "vitest";
import { LocalBookmarkStore, markedCards, type BookmarkEvent } from "./bookmarks";
import { MemoryStorage } from "./test/fakes";

const e = (id: string, s: string, on: boolean, at: string): BookmarkEvent => ({ id, s, on, at });
const same = (x: string) => x;

describe("★の判定（T026）", () => {
  it("肢ごとに一番新しい操作を正とする", () => {
    const evs = [
      e("1", "yobi-2026-minpo-q01-a", true, "2026-10-22T01:00:00.000Z"),
      e("2", "yobi-2026-minpo-q01-b", true, "2026-10-22T01:00:00.000Z"),
      e("3", "yobi-2026-minpo-q01-a", false, "2026-10-22T02:00:00.000Z"),
    ];
    expect([...markedCards(evs, same)]).toEqual(["yobi-2026-minpo-q01-b"]);
  });

  it("届いた順ではなく日時で決める（同期で古い操作があとから届いても変わらない）", () => {
    const evs = [e("3", "s-a", false, "2026-10-22T02:00:00.000Z"), e("1", "s-a", true, "2026-10-22T01:00:00.000Z")];
    expect([...markedCards(evs, same)]).toEqual([]);
  });

  it("日時が同じなら操作 ID の大きいほう（どの端末でも同じ結果）", () => {
    const at = "2026-10-22T01:00:00.000Z";
    expect([...markedCards([e("b", "s-a", true, at), e("a", "s-a", false, at)], same)]).toEqual(["s-a"]);
    expect([...markedCards([e("a", "s-a", false, at), e("b", "s-a", true, at)], same)]).toEqual(["s-a"]);
  });

  it("名寄せ：同じカードの別の出典の肢への操作も、同じカードの操作として扱う", () => {
    const card = (x: string) => (x === "shiho-2026-minpo-q30-a" ? "yobi-2026-minpo-q01-a" : x);
    const evs = [e("1", "shiho-2026-minpo-q30-a", true, "2026-10-22T01:00:00.000Z")];
    expect([...markedCards(evs, card)]).toEqual(["yobi-2026-minpo-q01-a"]);
    evs.push(e("2", "yobi-2026-minpo-q01-a", false, "2026-10-22T02:00:00.000Z"));
    expect([...markedCards(evs, card)]).toEqual([]);
  });
});

describe("LocalBookmarkStore", () => {
  it("同じ操作 ID は二重にしない。新しく足した分だけ返す", () => {
    const st = new LocalBookmarkStore(new MemoryStorage());
    expect(st.appendMany([e("1", "s-a", true, "2026-10-22T01:00:00.000Z")])).toHaveLength(1);
    expect(st.appendMany([e("1", "s-a", true, "2026-10-22T01:00:00.000Z"), e("2", "s-a", false, "2026-10-22T02:00:00.000Z")])).toHaveLength(1);
    expect(st.load().map((x) => x.id)).toEqual(["1", "2"]);
    st.clear();
    expect(st.load()).toEqual([]);
  });
});
