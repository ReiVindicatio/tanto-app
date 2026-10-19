// サーバーの API（/api/*）を呼ぶ（T003）。DB が何かは知らない（決定012）
import type { Answer } from "./store";

export type StoredAnswer = Answer & { received_at: string };

export interface ApiClient {
  /** keepalive：画面を閉じても送信を続ける（本文64KBまで） */
  push(answers: Answer[], opts?: { keepalive?: boolean }): Promise<{ inserted: number; received_at: string }>;
  pull(since?: string): Promise<StoredAnswer[]>;
  deleteMe(): Promise<void>;
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
    if (!res.ok) throw new Error(`API ${method} ${path}：${res.status}`);
    return res.json();
  }

  async push(answers: Answer[], opts: { keepalive?: boolean } = {}) {
    return (await this.call("POST", "/api/answers", { answers }, opts.keepalive ?? false)) as { inserted: number; received_at: string };
  }

  async pull(since?: string) {
    const q = since ? `?since=${encodeURIComponent(since)}` : "";
    return ((await this.call("GET", `/api/answers${q}`)) as { answers: StoredAnswer[] }).answers;
  }

  async deleteMe() {
    await this.call("DELETE", "/api/me");
  }
}
