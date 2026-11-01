import { describe, expect, it } from "vitest";
import { moonAge, moonKind, moonPath } from "./moon";

describe("本物の月の形", () => {
  it("既知の新月と満月（±1日）", () => {
    expect(moonKind(new Date("2024-01-11T12:00:00Z"))).toBe(0); // 新月
    expect(moonKind(new Date("2024-01-25T18:00:00Z"))).toBe(2); // 満月
    expect(moonKind(new Date("2024-01-18T12:00:00Z"))).toBe(1); // 上弦のころ
    expect(moonKind(new Date("2024-02-02T12:00:00Z"))).toBe(3); // 下弦のころ
  });

  it("月齢は 0〜29.53 に収まる。昔の日付でも", () => {
    for (const d of ["1990-05-05", "2026-11-02", "2040-01-01"]) {
      const a = moonAge(new Date(d));
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(29.54);
    }
  });

  it("形のパスを作れる", () => {
    expect(moonPath(new Date("2024-01-25T18:00:00Z"), 10)).toMatch(/^M 0 -10 A 10 10 0 0 /);
  });
});
