import { describe, expect, it } from "vitest";
import { cardRefsOf } from "./data";
import type { SetInfo } from "./types";

// T038：index.json の肢カードの一覧から、肢 ID と問 ID を作る
describe("cardRefsOf", () => {
  const info = { id: "yobi-2014-minpo", cards: "q01-a q01-b q05-1-2 q12-5" } as SetInfo;

  it("束の ID を付けて肢 ID に、先頭の qNN で問 ID にする（小問つきの肢も）", () => {
    expect(cardRefsOf(info)).toEqual([
      { id: "yobi-2014-minpo-q01-a", question_id: "yobi-2014-minpo-q01" },
      { id: "yobi-2014-minpo-q01-b", question_id: "yobi-2014-minpo-q01" },
      { id: "yobi-2014-minpo-q05-1-2", question_id: "yobi-2014-minpo-q05" },
      { id: "yobi-2014-minpo-q12-5", question_id: "yobi-2014-minpo-q12" },
    ]);
  });

  it("一覧が空・ないときは0枚", () => {
    expect(cardRefsOf({ ...info, cards: "" })).toEqual([]);
    expect(cardRefsOf({ ...info, cards: undefined })).toEqual([]);
  });
});
