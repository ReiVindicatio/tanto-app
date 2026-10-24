import { describe, expect, it } from "vitest";
import { chunks, speechText } from "./listen";

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
