import { afterEach, describe, expect, it } from "vitest";
import { characterImage, characterOn, listenFace, reactionFace, setCharacterOn } from "./character";

describe("キャラクターの表情（T063）", () => {
  it("答えたとき：正解は喜び、3問続けて正解なら得意げ。不正解は残念、2問続けて不正解ならジト目", () => {
    expect(reactionFace(true, 1, 0)).toBe("happy");
    expect(reactionFace(true, 3, 0)).toBe("smug");
    expect(reactionFace(false, 0, 1)).toBe("sad");
    expect(reactionFace(false, 0, 2)).toBe("jito");
  });

  it("聞き流しの場面ごと", () => {
    expect(listenFace("ready", null, 0, 0)).toBe("smile");
    expect(listenFace("reading", null, 0, 0)).toBe("normal");
    expect(listenFace("thinking", null, 0, 0)).toBe("think");
    expect(listenFace("answer", null, 0, 0)).toBe("normal"); // 押さなかった
    expect(listenFace("answer", true, 1, 0)).toBe("happy");
    expect(listenFace("answer", false, 0, 2)).toBe("jito");
    expect(listenFace("paused", null, 0, 0)).toBe("sleepy");
    expect(listenFace("done", null, 5, 0)).toBe("smile");
  });

  it("絵の置き場所はキャラクターごと", () => {
    expect(characterImage("base", "think")).toBe("/chars/ritsu/base-think.webp");
    expect(characterImage("chibi", "jito")).toBe("/chars/ritsu/chibi-jito.webp");
  });
});

describe("キャラクターの出す・出さない", () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  };
  afterEach(() => store.clear());

  it("既定は出す。出さないにすると覚える", () => {
    expect(characterOn()).toBe(true);
    setCharacterOn(false);
    expect(characterOn()).toBe(false);
    setCharacterOn(true);
    expect(characterOn()).toBe(true);
  });
});
