import { describe, expect, it } from "vitest";
import { clock, mockUnits, subjectScores, topShare } from "./mock";
import type { Question, SetInfo } from "./types";

const set = (exam: string, year: number, subject: string): SetInfo =>
  ({ id: `${exam}-${year}-${subject}`, exam: { type: exam, year, era: "R08" }, subject, subject_name: subject }) as unknown as SetInfo;

describe("模試の単位（T028）", () => {
  it("予備は科目群（科目がそろっているものだけ）、司法は H27 以降の科目。新しい年度から", () => {
    const sets = [
      set("yobi", 2026, "minpo"), set("yobi", 2026, "shoho"), set("yobi", 2026, "minso"),
      set("yobi", 2026, "kenpo"), // 行政法がないので憲法・行政法は作らない
      set("shiho", 2014, "minpo"), set("shiho", 2015, "minpo"), set("yobi", 2025, "keiho"), set("yobi", 2025, "keiso"),
    ];
    expect(mockUnits(sets).map((u) => u.key)).toEqual(["yobi-2026-minji", "yobi-2025-keiji", "shiho-2015-minpo"]);
  });
});

describe("時間と得点", () => {
  it("残り時間は秒を切り上げて m:ss", () => {
    expect(clock(60 * 60_000)).toBe("60:00");
    expect(clock(61_001)).toBe("1:02");
    expect(clock(-5)).toBe("0:00");
  });

  it("科目ごとの得点と満点は問の配点の和", () => {
    const q = (id: string, subject: string, points: number) => ({ id, subject, points }) as Question;
    const s = subjectScores([q("a", "kenpo", 2), q("b", "kenpo", 3), q("c", "gyosei", 2)], new Map([["a", 2], ["c", 1]]));
    expect(s).toEqual([
      { subject: "kenpo", earned: 2, full: 5 },
      { subject: "gyosei", earned: 1, full: 2 },
    ]);
  });

  it("上位○％は、その点数以上の受験者の割合", () => {
    // 0点1人・1点2人・2点1人
    expect(topShare([1, 2, 1], 2)).toBe(0.25);
    expect(topShare([1, 2, 1], 1)).toBe(0.75);
    expect(topShare([1, 2, 1], 0)).toBe(1);
    expect(topShare([0, 0], 1)).toBeNull();
  });
});
