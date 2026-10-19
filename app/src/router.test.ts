import { describe, expect, it } from "vitest";
import { parse, tabOf, toPath } from "./router";

describe("router（T025）", () => {
  it("URL と画面の対応（行きと帰りが一致する）", () => {
    const routes = [{ name: "home" }, { name: "subjects" }, { name: "subject", subject: "minpo" }, { name: "me" }, { name: "play" }] as const;
    for (const r of routes) expect(parse(toPath(r))).toEqual(r);
  });

  it("末尾のスラッシュは無視し、知らない URL はホームにする", () => {
    expect(parse("/subjects/")).toEqual({ name: "subjects" });
    expect(parse("/nosuch")).toEqual({ name: "home" });
    expect(parse("/subjects/MINPO")).toEqual({ name: "home" });
  });

  it("科目の画面は科目タブ、解いている画面はタブなし", () => {
    expect(tabOf({ name: "subject", subject: "keiho" })).toBe("subjects");
    expect(tabOf({ name: "play" })).toBeNull();
    expect(tabOf({ name: "me" })).toBe("me");
  });
});
