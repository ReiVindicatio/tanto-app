import { describe, expect, it } from "vitest";
import { drawWidth, makeWind } from "./cape";
import { KITS } from "./kits";

describe("風", () => {
  it("強さは 0〜1 の中で、不規則に変わる。流れた距離は戻らない", () => {
    let seed = 1;
    const wind = makeWind(() => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    });
    let phi = 0;
    const seen: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const w = wind.step(0.016);
      expect(w.gust).toBeGreaterThanOrEqual(0);
      expect(w.gust).toBeLessThanOrEqual(1);
      expect(w.phi).toBeGreaterThan(phi);
      phi = w.phi;
      seen.push(w.gust);
    }
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.3); // 突風が来て、弱まる
  });

  it("生きた座り絵があるのは、作り終えた衣装だけ。全画面の技は衣装ごとに別", () => {
    const live = Object.entries(KITS).filter(([, k]) => k.live);
    expect(live.map(([id]) => id).sort()).toEqual(["diva", "hakama", "hoshiyomi", "nocturne", "rock", "yukihana"]);
    expect(new Set(live.map(([, k]) => k.live?.signature)).size).toBe(live.length);
  });
});

describe("drawWidth（風を受ける絵を描く幅）", () => {
  it("画面に出す大きさ（CSS の幅 × 画面の細かさ）。PC の等倍なら元の絵よりずっと小さく", () => {
    expect(drawWidth(160, 1, 780)).toBe(160);
    expect(drawWidth(160, 3, 780)).toBe(480);
    expect(drawWidth(160.4, 1.25, 780)).toBe(201);
  });
  it("元の絵より大きくはしない。大きさが分からないときは元のまま", () => {
    expect(drawWidth(400, 3, 780)).toBe(780);
    expect(drawWidth(0, 1, 780)).toBe(780);
    expect(drawWidth(160, 0, 780)).toBe(780);
  });
});
