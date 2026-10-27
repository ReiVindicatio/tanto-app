import { afterEach, describe, expect, it } from "vitest";
import { audioUrls, chunks, clipUrl, getListenPrefs, speechText } from "./listen";

describe("聞き流しの読み上げる文（T057）", () => {
  it("解答欄の番号は読まない", () => {
    expect(speechText("告訴は、代理人によってもすることができる。［№11］")).toBe("告訴は、代理人によってもすることができる。");
  });

  it("読み間違えやすい語を読み替える", () => {
    expect(speechText("目的物に瑕疵があるときは、競売を請求できる。")).toBe("目的物にかしがあるときは、けいばいを請求できる。");
    expect(speechText("正解は○")).toBe("正解はまる");
  });

  it("長い文は句点で区切り、それでも長ければ読点で区切る", () => {
    expect(chunks("短い文。次の文。")).toEqual(["短い文。", "次の文。"]);
    const long = "あ".repeat(50) + "、" + "い".repeat(50) + "。";
    const parts = chunks(long, 80);
    expect(parts).toHaveLength(2);
    expect(parts.join("")).toBe(long);
  });
});

describe("聞き流しの声（T061）", () => {
  const store = (v: string | null) => {
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => v, setItem: () => {} };
  };
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("声の既定は声1（アニメ風）。覚えた声2はそのまま、おかしな値は声1", () => {
    store(null);
    expect(getListenPrefs().voice).toBe(1);
    store(JSON.stringify({ rate: 1, pause: 3 })); // 声を足す前に覚えた設定
    expect(getListenPrefs()).toEqual({ rate: 1, pause: 3, voice: 1 });
    store(JSON.stringify({ voice: 2 }));
    expect(getListenPrefs().voice).toBe(2);
    store(JSON.stringify({ voice: 3 }));
    expect(getListenPrefs().voice).toBe(1);
  });

  it("声1は声1 → 声2 の順に試し、声2は声2だけ", () => {
    expect(audioUrls("x-1", "q", 1)).toEqual(["/audio/tts/gemini-leda/x-1.q.mp3", "/audio/tts/ja-JP-Chirp3-HD-Achernar/x-1.q.mp3"]);
    expect(audioUrls("x-1", "a", 2)).toEqual(["/audio/tts/ja-JP-Chirp3-HD-Achernar/x-1.a.mp3"]);
  });

  it("「正解。」「不正解。」は声ごとの置き場所", () => {
    expect(clipUrl("fuseikai", 1)).toBe("/sounds/gemini-leda/fuseikai.mp3");
    expect(clipUrl("fuseikai", 2)).toBe("/sounds/fuseikai.mp3");
    expect(clipUrl("seikai", 2)).toBe("/sounds/seikai.mp3");
  });

  it("声1の「正解」は6本からランダム（端も含めて範囲に収まる）", () => {
    expect(clipUrl("seikai", 1, 0)).toBe("/sounds/gemini-leda/seikai-1.mp3");
    expect(clipUrl("seikai", 1, 0.5)).toBe("/sounds/gemini-leda/seikai-4.mp3");
    expect(clipUrl("seikai", 1, 0.9999)).toBe("/sounds/gemini-leda/seikai-6.mp3");
    for (let k = 0; k < 50; k++) expect(clipUrl("seikai", 1)).toMatch(/^\/sounds\/gemini-leda\/seikai-[1-6]\.mp3$/);
  });
});
