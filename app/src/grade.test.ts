import { describe, expect, it } from "vitest";
import { grade, slotOptions } from "./grade";
import { question, statement } from "./test/fakes";

describe("grade", () => {
  it("組合せ：正解で満点、誤答で0点", () => {
    const q = question({});
    expect(grade(q, [3])).toMatchObject({ full: true, earned: 2 });
    expect(grade(q, [1])).toMatchObject({ full: false, earned: 0 });
  });

  it("順不同：逆順でも満点", () => {
    const q = question({ format: "multi_select_unordered", unordered: true, points: 3,
      answer_slots: [{ no: 2, official_answer: 2 }, { no: 3, official_answer: 5 }] });
    expect(grade(q, [5, 2])).toMatchObject({ full: true, earned: 3 });
    expect(grade(q, [2, 2]).correctCount).toBe(1); // 同じ番号を2回選んでも1つ分
  });

  it("順不同の部分点（1つ正解で1点）", () => {
    const q = question({ format: "multi_select_unordered", unordered: true, points: 2,
      answer_slots: [{ no: 2, official_answer: 2 }, { no: 3, official_answer: 5 }],
      scoring: { partial_credit: { correct_needed: 1, points: 1 }, no_partial_credit: false, raw_note: "" } });
    expect(grade(q, [2, 4]).earned).toBe(1);
  });

  it("各肢○×：4問正解で部分点2点", () => {
    const q = question({ format: "true_false_each", points: 4,
      answer_slots: [2, 1, 2, 2, 2].map((v, k) => ({ no: 15 + k, official_answer: v })),
      scoring: { partial_credit: { correct_needed: 4, points: 2 }, no_partial_credit: false, raw_note: "" } });
    expect(grade(q, [2, 1, 2, 2, 2]).earned).toBe(4);
    expect(grade(q, [1, 1, 2, 2, 2]).earned).toBe(2);
    expect(grade(q, [1, 2, 2, 2, 2]).earned).toBe(0);
  });

  it("小問つき：小問ごとに、その小問の肢の数だけ選べる", () => {
    const q = question({ format: "compound", answer_slots: [{ no: 5, official_answer: 2, sub: 0 }, { no: 6, official_answer: 3, sub: 1 }] });
    const sts = [0, 0, 0, 1, 1, 1].map((g, k) => statement(`yobi-2014-minpo-q05-${g + 1}-${k}`, { sub: g }));
    expect(slotOptions(q, 0, sts)).toHaveLength(3);
    expect(slotOptions(q, 1, sts)).toHaveLength(3);
    expect(grade(q, [2, 3])).toMatchObject({ full: true, earned: 2 });
  });
});
