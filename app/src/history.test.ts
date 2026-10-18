import { describe, expect, it } from "vitest";
import { initLearning } from "./learning";
import { applyFilter, summarize } from "./history";
import { ans, MemoryStore } from "./test/fakes";

describe("history", () => {
  it("未回答・前回まちがえたで絞り込み、集計する", async () => {
    await initLearning(
      new MemoryStore([
        ans("x-1-minpo-q01-a", true, "2026-10-01T00:00:00.000Z"),
        ans("x-1-minpo-q01-b", true, "2026-10-01T00:00:00.000Z"),
        ans("x-1-minpo-q01-b", false, "2026-10-02T00:00:00.000Z"),
      ]),
    );
    const cards = ["x-1-minpo-q01-a", "x-1-minpo-q01-b", "x-1-minpo-q01-c"].map((id) => ({ id }));
    expect(applyFilter(cards, "all")).toHaveLength(3);
    expect(applyFilter(cards, "unanswered").map((c) => c.id)).toEqual(["x-1-minpo-q01-c"]);
    expect(applyFilter(cards, "wrong").map((c) => c.id)).toEqual(["x-1-minpo-q01-b"]);
    expect(summarize(cards.map((c) => c.id))).toEqual({ answered: 2, lastCorrect: 1 });
  });
});
