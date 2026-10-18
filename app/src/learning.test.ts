import { describe, expect, it } from "vitest";
import { initLearning, recordAnswer, replay, currentState, localDate, subjectOf } from "./learning";
import { ans, MemoryStore } from "./test/fakes";

describe("replay", () => {
  it("回答ログから集計（回答数・正解数・最後の正誤）を作る", () => {
    const s = replay([
      ans("yobi-2026-minpo-q01-a", false, "2026-10-01T00:00:00.000Z"),
      ans("yobi-2026-minpo-q01-a", true, "2026-10-02T00:00:00.000Z"),
    ]);
    expect(s.history.get("yobi-2026-minpo-q01-a")).toEqual({ attempts: 2, correct: 1, last: true, at: "2026-10-02T00:00:00.000Z" });
  });

  it("日時の順に並べ直してから流す（最後の正誤は最新の回答）", () => {
    const s = replay([
      ans("yobi-2026-minpo-q01-a", true, "2026-10-02T00:00:00.000Z"),
      ans("yobi-2026-minpo-q01-a", false, "2026-10-01T00:00:00.000Z"),
    ]);
    expect(s.history.get("yobi-2026-minpo-q01-a")!.last).toBe(true);
  });

  it("同じ回答 ID の重複は1回だけ数える", () => {
    const a = ans("yobi-2026-minpo-q01-a", true, "2026-10-01T00:00:00.000Z", "dup");
    const s = replay([a, { ...a }]);
    expect(s.history.get("yobi-2026-minpo-q01-a")!.attempts).toBe(1);
  });

  it("新規の数は、肢を初めて答えた日に科目ごとに数える", () => {
    const t1 = "2026-10-01T03:00:00.000Z";
    const s = replay([
      ans("yobi-2026-minpo-q01-a", true, t1),
      ans("yobi-2026-minpo-q01-a", true, t1),
      ans("yobi-2026-minpo-q01-b", false, t1),
      ans("yobi-2026-keiho-q01-a", true, t1),
    ]);
    const day = localDate(new Date(t1));
    expect(s.newCount.get(`minpo:${day}`)).toBe(2);
    expect(s.newCount.get(`keiho:${day}`)).toBe(1);
  });

  it("FSRS：不正解の直後は期限が近く、正解すると期限が延びる", () => {
    const t = "2026-10-01T00:00:00.000Z";
    const s = replay([ans("yobi-2026-minpo-q01-a", false, t), ans("yobi-2026-minpo-q01-b", true, t)]);
    const wrong = s.cards.get("yobi-2026-minpo-q01-a")!.due.getTime();
    const right = s.cards.get("yobi-2026-minpo-q01-b")!.due.getTime();
    expect(right).toBeGreaterThan(wrong);
  });
});

describe("recordAnswer", () => {
  it("メモリ上の状態をすぐ更新し、保存先に追記する", async () => {
    const store = new MemoryStore();
    await initLearning(store);
    recordAnswer("yobi-2026-minpo-q02-c", false, new Date("2026-10-05T00:00:00.000Z"));
    expect(currentState().history.get("yobi-2026-minpo-q02-c")!.last).toBe(false);
    await Promise.resolve();
    expect(store.log).toHaveLength(1);
    expect(store.log[0]).toMatchObject({ s: "yobi-2026-minpo-q02-c", ok: false });
  });

  it("保存先から読み直すと同じ状態になる", async () => {
    const store = new MemoryStore();
    await initLearning(store);
    recordAnswer("yobi-2026-minpo-q03-d", true, new Date("2026-10-05T00:00:00.000Z"));
    await Promise.resolve();
    const before = currentState().history.get("yobi-2026-minpo-q03-d");
    await initLearning(store);
    expect(currentState().history.get("yobi-2026-minpo-q03-d")).toEqual(before);
  });
});

describe("subjectOf", () => {
  it("肢 ID から科目を取り出す", () => {
    expect(subjectOf("yobi-2014-minpo-q05-1-2")).toBe("minpo");
  });
});
