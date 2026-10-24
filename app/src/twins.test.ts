import { describe, expect, it } from "vitest";
import { pairCount, pairDeck, twinsOf, type Twins } from "./twins";

const card = (truth: boolean, ...ids: string[]) => ({ text: `本文 ${ids[0]}`, truth, src: ids[0], ids });

// 刑法の組2つ（q01-4 は2つの組に出る）と、民法の改正前の年度だけの肢との組
const T: Twins = {
  pairs: [
    { a: "yobi-2021-keiho-q01-4", b: "yobi-2021-keiho-q01-5", sim: 0.96, ad: [[0, 2]], bd: [[0, 2]] },
    { a: "yobi-2021-keiho-q01-4", b: "shiho-2023-keiho-q07-2", sim: 0.8, ad: [[1, 3]], bd: [[4, 5]] },
    { a: "yobi-2015-minpo-q03-1", b: "yobi-2022-minpo-q05-2", sim: 0.9, ad: [], bd: [] },
  ],
  cards: {
    "yobi-2021-keiho-q01-4": card(true, "yobi-2021-keiho-q01-4"),
    "yobi-2021-keiho-q01-5": card(false, "yobi-2021-keiho-q01-5"),
    "shiho-2023-keiho-q07-2": card(false, "shiho-2023-keiho-q07-2"),
    "yobi-2015-minpo-q03-1": card(true, "yobi-2015-minpo-q03-1"),
    "yobi-2022-minpo-q05-2": card(false, "yobi-2022-minpo-q05-2"),
  },
};

describe("答え合わせの後に出すよく似た肢（T050）", () => {
  it("似ている順に出し、こちらと相手の違う部分を入れ替えずに返す", () => {
    const v = twinsOf(T, "yobi-2021-keiho-q01-4", new Set());
    expect(v.map((x) => x.otherId)).toEqual(["yobi-2021-keiho-q01-5", "shiho-2023-keiho-q07-2"]);
    const fromB = twinsOf(T, "shiho-2023-keiho-q07-2", new Set());
    expect(fromB[0].mineDiff).toEqual([[4, 5]]);
    expect(fromB[0].otherDiff).toEqual([[1, 3]]);
    expect(fromB[0].other.truth).toBe(true);
  });

  it("相手がこのあと出題されるなら出さない（答えが先に分かってしまう）", () => {
    const v = twinsOf(T, "yobi-2021-keiho-q01-4", new Set(["yobi-2021-keiho-q01-5"]));
    expect(v.map((x) => x.otherId)).toEqual(["shiho-2023-keiho-q07-2"]);
  });

  it("民法の改正前の年度にしか出ていない相手は、こちらが改正後なら出さない", () => {
    expect(twinsOf(T, "yobi-2022-minpo-q05-2", new Set())).toEqual([]);
    expect(twinsOf(T, "yobi-2015-minpo-q03-1", new Set())).toHaveLength(1);
  });

  it("組のない肢には何も出さない", () => {
    expect(twinsOf(T, "yobi-2021-keiho-q02-1", new Set())).toEqual([]);
  });
});

describe("よく似た肢を続けて解く（T050）", () => {
  const all = new Set(["yobi-2021-keiho", "shiho-2023-keiho", "yobi-2015-minpo", "yobi-2022-minpo"]);

  it("1枚が複数の組に出るときは、似ている順に先の組だけ使う", () => {
    expect(pairCount(T, "keiho", all)).toBe(1);
    const deck = pairDeck(T, "keiho", all).map((c) => c.id);
    expect(new Set(deck)).toEqual(new Set(["yobi-2021-keiho-q01-4", "yobi-2021-keiho-q01-5"]));
  });

  it("組の2枚は続けて出す", () => {
    const t: Twins = {
      pairs: [
        { a: "yobi-2021-keiho-q01-1", b: "yobi-2021-keiho-q01-2", sim: 0.9, ad: [], bd: [] },
        { a: "yobi-2021-keiho-q03-1", b: "yobi-2021-keiho-q03-2", sim: 0.8, ad: [], bd: [] },
      ],
      cards: Object.fromEntries(
        ["q01-1", "q01-2", "q03-1", "q03-2"].map((x, k) => [`yobi-2021-keiho-${x}`, card(k % 2 === 0, `yobi-2021-keiho-${x}`)]),
      ),
    };
    for (let k = 0; k < 10; k++) {
      const deck = pairDeck(t, "keiho", all).map((c) => c.id.replace(/-\d$/, ""));
      expect(deck[0]).toBe(deck[1]);
      expect(deck[2]).toBe(deck[3]);
    }
  });

  it("両方の肢が絞り込みの年度に入っている組だけ。名寄せした別の出典の肢でもよい", () => {
    expect(pairCount(T, "minpo", new Set(["yobi-2022-minpo"]))).toBe(0);
    const t: Twins = { ...T, cards: { ...T.cards, "yobi-2015-minpo-q03-1": card(true, "yobi-2015-minpo-q03-1", "shiho-2024-minpo-q10-3") } };
    const deck = pairDeck(t, "minpo", new Set(["yobi-2022-minpo", "shiho-2024-minpo"])).map((c) => c.id);
    expect(new Set(deck)).toEqual(new Set(["shiho-2024-minpo-q10-3", "yobi-2022-minpo-q05-2"]));
  });
});
