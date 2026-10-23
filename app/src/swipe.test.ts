import { describe, expect, it } from "vitest";
import { swipeDecision, swipeThreshold } from "./swipe";

describe("はじく操作の判定（T051）", () => {
  it("はじいたとみなす距離は画面の幅の4分の1、狭い画面でも 80px", () => {
    expect(swipeThreshold(400)).toBe(100);
    expect(swipeThreshold(200)).toBe(80);
  });

  it("右へ遠くまで動かしたら○、左なら×", () => {
    expect(swipeDecision(120, 10, 800, 400)).toBe("right");
    expect(swipeDecision(-120, 10, 800, 400)).toBe("left");
  });

  it("短い距離でも素早く払えば確定、ゆっくりなら確定しない", () => {
    expect(swipeDecision(60, 0, 50, 400)).toBe("right");
    expect(swipeDecision(60, 0, 500, 400)).toBeNull();
  });

  it("ごく短い動きは素早くても確定しない（タップの揺れ）", () => {
    expect(swipeDecision(30, 0, 10, 400)).toBeNull();
  });

  it("斜めに大きく動いたもの（縦の動きが大きい）は確定しない", () => {
    expect(swipeDecision(120, 100, 300, 400)).toBeNull();
  });

  it("途中で戻して離したら確定しない（迷ったら元の位置へ）", () => {
    expect(swipeDecision(5, 0, 900, 400)).toBeNull();
  });
});
