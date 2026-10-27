import { describe, expect, it } from "vitest";
import { envelope, voicedAt, STEP } from "./lipsync";

describe("口パクを声に合わせる（T065）", () => {
  it("声の大きさを STEP 秒ごとに出し、声が出ているところだけ口を開ける（無音・句読点の間は閉じる）", () => {
    const rate = 1000;
    // 0〜0.2秒は声、0.2〜0.4秒は無音、0.4〜0.6秒はまた声
    const s = new Float32Array(600).map((_, i) => (i < 200 || i >= 400 ? Math.sin(i) * 0.8 : 0));
    const env = envelope(s, rate);
    expect(env.length).toBe(Math.ceil(600 / (rate * STEP)));
    expect(Math.max(...env)).toBeCloseTo(1);
    expect(voicedAt(env, 0.1)).toBe(true);
    expect(voicedAt(env, 0.3)).toBe(false);
    expect(voicedAt(env, 0.5)).toBe(true);
    expect(voicedAt(env, 0.7)).toBe(false); // 終わったあと
  });
});
