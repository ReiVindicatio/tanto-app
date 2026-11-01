import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUnlocked, markRevealed, nextTheme, themeById, THEMES, unlockLabel } from "./themes";
import { refreshAdmin, isAdmin } from "../admin";
import { addQuestionResult, extraXp, MOCK_XP, mockSubmits, QUESTION_XP } from "../extraXp";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});
const mock = (key: string, earned: number, at = "2026-11-01T03:00:00.000Z") => ({ key, earned, full: 30, elapsedMs: 1, timedOut: false, at });

describe("衣装の開き方（T068）", () => {
  it("レベルの衣装はレベルで開き、次に開く衣装はレベルの順。節目の衣装はレベルでは開かない", () => {
    const hoodie = themeById("hoodie")!;
    expect(isUnlocked(hoodie, 9)).toBe(false);
    expect(isUnlocked(hoodie, 10)).toBe(true);
    expect(unlockLabel(hoodie)).toBe("Lv.10 で開く");
    expect(nextTheme(5)?.id).toBe("hoodie");
    expect(THEMES[0].id).toBe("default");
    expect(THEMES[1].id).toBe("knit");
    const blazer = themeById("blazer")!;
    expect(isUnlocked(blazer, 999)).toBe(false);
    expect(unlockLabel(blazer)).toBe("模試を1回提出で開く");
  });

  it("節目の衣装は模試の提出で開く。0点の提出と、同じ模試の同じ日の出し直しは数えない", () => {
    const blazer = themeById("blazer")!;
    store.set("tanto.mock.v1", JSON.stringify([mock("yobi-a", 0)]));
    expect(mockSubmits()).toBe(0);
    expect(isUnlocked(blazer, 1)).toBe(false);
    store.set("tanto.mock.v1", JSON.stringify([mock("yobi-a", 10), mock("yobi-a", 12)]));
    expect(mockSubmits()).toBe(1);
    expect(isUnlocked(blazer, 1)).toBe(true);
  });

  it("一度お披露目を見た衣装は、条件が足りなくても開いたまま", () => {
    markRevealed("hoodie");
    expect(isUnlocked(themeById("hoodie")!, 1)).toBe(true);
  });

  it("買う衣装はレベルでも節目でも開かない。管理者は全部開く", () => {
    const paid = { id: "x", name: "x", level: 1, unlock: "paid" };
    expect(isUnlocked(paid, 999)).toBe(false);
    store.set("tanto.admin.v1", "1");
    expect(isUnlocked(paid, 1)).toBe(true);
    expect(isUnlocked(themeById("exam") ?? themeById("blazer")!, 1)).toBe(true);
  });
});

describe("管理者の判定（T068）", () => {
  const res = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
  it("サーバーの答えを覚える。ログインしていなければ外す。通信に失敗したら今の値のまま", async () => {
    await refreshAdmin(async () => "t", res({ admin: true }));
    expect(isAdmin()).toBe(true);
    await refreshAdmin(async () => "t", res({}, false));
    expect(isAdmin()).toBe(true);
    await refreshAdmin(async () => "t", res({ admin: false }));
    expect(isAdmin()).toBe(false);
    store.set("tanto.admin.v1", "1");
    await refreshAdmin(async () => null, res({ admin: true }));
    expect(isAdmin()).toBe(false);
  });
});

describe("問で解く・模試の経験値（T068）", () => {
  it("問で解くは満点3・それ以外1（同じ問は同じ日に1回）。模試は提出で50", () => {
    const d = new Date("2026-11-01T03:00:00.000Z");
    addQuestionResult("yobi-2026-minpo-q01", true, d);
    addQuestionResult("yobi-2026-minpo-q01", false, d);
    addQuestionResult("yobi-2026-minpo-q02", false, d);
    expect(extraXp()).toBe(QUESTION_XP.full + QUESTION_XP.other);
    store.set("tanto.mock.v1", JSON.stringify([mock("yobi-a", 10)]));
    expect(extraXp()).toBe(QUESTION_XP.full + QUESTION_XP.other + MOCK_XP);
  });
});
