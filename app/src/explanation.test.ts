import { describe, expect, it } from "vitest";
import { explainedUnderCurrentLaw } from "./ExplanationView";

describe("民法の改正前の出題の解説（T013）", () => {
  it("民法の2019年以前だけ「現行の条文で説明」の注記を出す", () => {
    expect(explainedUnderCurrentLaw("yobi-2019-minpo-q01-a")).toBe(true);
    expect(explainedUnderCurrentLaw("shiho-2011-minpo-q12")).toBe(true); // 問の解説
    expect(explainedUnderCurrentLaw("yobi-2020-minpo-q01-a")).toBe(false);
    expect(explainedUnderCurrentLaw("shiho-2015-keiho-q01-a")).toBe(false);
  });
});
