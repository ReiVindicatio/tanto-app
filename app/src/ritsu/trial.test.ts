import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeTrial, inTrial, openTrial, setTrialAccount, setWanted, trialAnswered, trialOver, trialState, TRIAL_ANSWERS, wanted } from "./trial";
import { isUnlocked, themeById } from "./themes";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const reply = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response) as unknown as typeof fetch;
const UNTIL = "2026-11-06T00:00:00.000Z";

describe("お試し（T070）", () => {
  beforeEach(() => {
    store.clear();
    setTrialAccount(async () => "token", true);
  });

  it("サーバーが許したら始まり、見本の1着だけ開く。ほかの衣装は開かない", async () => {
    expect(await openTrial("default", reply({ available: true, costume: "hoshiyomi", until: UNTIL }))).toBe("started");
    expect(inTrial("hoshiyomi")).toBe(true);
    expect(isUnlocked(themeById("hoshiyomi")!, 1)).toBe(true);
    expect(isUnlocked(themeById("diva")!, Infinity)).toBe(false);
  });

  it("使い切りと答えられたら終わった扱いにする。通信できなければ何も変えない", async () => {
    expect(await openTrial("default", reply({ available: false }))).toBe("used");
    expect(trialState().status).toBe("done");
    store.clear();
    expect(await openTrial("default", reply({}, false))).toBe("failed");
    expect(await openTrial("default", vi.fn(async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch)).toBe("failed");
    expect(trialState().status).toBe("none");
  });

  it("答えるたびに減り、0で止まる。期限でも終わり。終えたら開かない", async () => {
    await openTrial("default", reply({ available: true, costume: "hoshiyomi", until: UNTIL }));
    for (let k = 0; k < TRIAL_ANSWERS - 1; k++) trialAnswered();
    expect(trialOver(trialState(), Date.parse(UNTIL) - 1)).toBe(false);
    trialAnswered();
    trialAnswered();
    const t = trialState();
    expect(t.status === "on" && t.left).toBe(0);
    expect(trialOver(t, Date.parse(UNTIL) - 1)).toBe(true);
    closeTrial("hoshiyomi");
    expect(isUnlocked(themeById("hoshiyomi")!, Infinity)).toBe(false);
  });

  it("48時間を過ぎたら、残りの問があっても終わる", async () => {
    await openTrial("default", reply({ available: true, costume: "hoshiyomi", until: UNTIL }));
    expect(trialOver(trialState(), Date.parse(UNTIL))).toBe(true);
  });

  it("ログインしていなければ始まらない", async () => {
    setTrialAccount(async () => null, false);
    const f = reply({ available: true, costume: "hoshiyomi", until: UNTIL });
    expect(await openTrial("default", f)).toBe("failed");
    expect(f).not.toHaveBeenCalled();
  });

  it("欲しい：届いたら覚える。届かなければ変えない", async () => {
    expect(await setWanted("diva", true, reply({ want: true }))).toBe(true);
    expect(wanted("diva")).toBe(true);
    expect(await setWanted("diva", false, reply({}, false))).toBe(false);
    expect(wanted("diva")).toBe(true);
    expect(await setWanted("diva", false, reply({ want: false }))).toBe(true);
    expect(wanted("diva")).toBe(false);
  });
});
