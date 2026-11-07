import { describe, expect, it } from "vitest";
import { EARLY_ACCESS, inEarlyAccess } from "./earlyAccess";

describe("ベータ版の特典の期間（T074）", () => {
  it("始まりから。終わりがなければずっと、あればその前まで", () => {
    const e = { costume: "hoshiyomi", from: "2026-11-07T00:00:00+09:00", until: null };
    expect(inEarlyAccess(new Date("2026-11-06T14:59:59Z"), e)).toBe(false);
    expect(inEarlyAccess(new Date("2026-11-06T15:00:00Z"), e)).toBe(true);
    expect(inEarlyAccess(new Date("2030-01-01T00:00:00Z"), e)).toBe(true);
    const ended = { ...e, until: "2027-11-07T00:00:00+09:00" };
    expect(inEarlyAccess(new Date("2027-11-06T14:59:59Z"), ended)).toBe(true);
    expect(inEarlyAccess(new Date("2027-11-06T15:00:00Z"), ended)).toBe(false);
  });

  it("渡すのは見本の星詠み（課金衣装の ID）", () => {
    expect(EARLY_ACCESS.costume).toBe("hoshiyomi");
  });
});
