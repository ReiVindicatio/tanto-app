// サーバーの API（/api/*）を呼ぶ（T003）。DB が何かは知らない（決定012）
import type { Answer } from "./store";
import type { BookmarkEvent } from "./bookmarks";

export type StoredAnswer = Answer & { received_at: string };
export type StoredBookmark = BookmarkEvent & { received_at: string };
/** 誤り報告（T040）。context はアプリが自動で付ける JSON 文字列 */
export type Report = { id: string; target: string; kind: "question" | "truth" | "explanation" | "other"; body: string; context: string };

/** サーバーの使いすぎの制限に当たった（T040）。画面には出さず、あとで送り直す */
export class RateLimitedError extends Error {
  constructor() {
    super("しばらくしてから送り直します");
  }
}

export interface ApiClient {
  /** keepalive：画面を閉じても送信を続ける（本文64KBまで）。bookmarks：★の操作も同じ呼び出しで送る（T026） */
  push(answers: Answer[], opts?: { keepalive?: boolean; bookmarks?: BookmarkEvent[] }): Promise<{ inserted: number; received_at: string }>;
  pull(since?: string): Promise<{ answers: StoredAnswer[]; bookmarks: StoredBookmark[] }>;
  deleteMe(): Promise<void>;
  report(r: Report): Promise<void>;
}

export class HttpApiClient implements ApiClient {
  constructor(private readonly getToken: () => Promise<string | null>, private readonly base = "") {}

  private async call(method: string, path: string, body?: unknown, keepalive = false): Promise<unknown> {
    const token = await this.getToken();
    if (!token) throw new Error("ログインしていません");
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      keepalive,
    });
    if (res.status === 429) throw new RateLimitedError();
    if (!res.ok) throw new Error(`API ${method} ${path}：${res.status}`);
    return res.json();
  }

  async push(answers: Answer[], opts: { keepalive?: boolean; bookmarks?: BookmarkEvent[] } = {}) {
    const body = opts.bookmarks?.length ? { answers, bookmarks: opts.bookmarks } : { answers };
    return (await this.call("POST", "/api/answers", body, opts.keepalive ?? false)) as { inserted: number; received_at: string };
  }

  async pull(since?: string) {
    const q = since ? `?since=${encodeURIComponent(since)}` : "";
    const r = (await this.call("GET", `/api/answers${q}`)) as { answers: StoredAnswer[]; bookmarks?: StoredBookmark[] };
    return { answers: r.answers, bookmarks: r.bookmarks ?? [] };
  }

  async deleteMe() {
    await this.call("DELETE", "/api/me");
  }

  async report(r: Report) {
    await this.call("POST", "/api/reports", r);
  }
}
