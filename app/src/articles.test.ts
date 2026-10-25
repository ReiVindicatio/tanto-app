import { describe, expect, it } from "vitest";
import { articleLabel, lawsOfSubject, parseArticleInput, topArticles, yearsOf, type ArticleIndex } from "./articles";

const I: ArticleIndex = {
  laws: {
    民法: { id: "minpo", articles: { "94": "yobi-2026-minpo-q01-a yobi-2025-minpo-q02-b shiho-2026-minpo-q03-c", "94_2": "yobi-2026-minpo-q04-a" } },
    民事訴訟法: { id: "minso", articles: { "114": "yobi-2026-minpo-q05-a yobi-2026-minso-q31-1" } },
  },
};

describe("条文から逆引き（T060）", () => {
  it("条の番号の表示と、入力の読み取り", () => {
    expect(articleLabel("94_2")).toBe("94条の2");
    expect(articleLabel("前文")).toBe("前文");
    for (const s of ["94の2", "94-2", "第94条の2", "９４条の２", "94_2"]) expect(parseArticleInput(s)).toBe("94_2");
    expect(parseArticleInput("94")).toBe("94");
    expect(parseArticleInput("abc")).toBeNull();
  });

  it("科目のよく出る条文は、その科目の肢で絞り込みの年度の分だけを数える", () => {
    const all = new Set(["yobi-2026-minpo", "yobi-2025-minpo", "shiho-2026-minpo", "yobi-2026-minso"]);
    expect(topArticles(I, "minpo", all).map((a) => [a.law, a.article, a.count])).toEqual([
      ["民法", "94", 3],
      ["民法", "94_2", 1],
      ["民事訴訟法", "114", 1],
    ]);
    expect(topArticles(I, "minpo", new Set(["yobi-2026-minpo"]))[0].count).toBe(1);
    expect(lawsOfSubject(I, "minpo", all)).toEqual(["民法", "民事訴訟法"]);
  });

  it("出た年度の内訳は新しい年度から", () => {
    expect(yearsOf(["yobi-2025-minpo-q02-b", "yobi-2026-minpo-q01-a", "shiho-2026-minpo-q03-c"])).toEqual([
      { exam: "shiho", year: 2026, count: 1 },
      { exam: "yobi", year: 2026, count: 1 },
      { exam: "yobi", year: 2025, count: 1 },
    ]);
  });
});
