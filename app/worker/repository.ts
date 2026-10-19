// 回答ログの保存処理（T003）。DB を知っているのはこのファイルだけ。
// DB を入れ替えるときは AnswerRepository の実装を足し、index.ts で渡す（決定012）。

/** API とアプリの間でやりとりする回答1件（アプリ側の Answer と同じ形） */
export type Answer = { id: string; s: string; ok: boolean; at: string };
/** サーバーに保存された回答（受け取った日時つき） */
export type StoredAnswer = Answer & { received_at: string };

export interface AnswerRepository {
  /** その利用者の回答ログ。since を渡すと、それより後に受け取った分だけ */
  list(userId: string, since?: string): Promise<StoredAnswer[]>;
  /** 回答を保存する。同じ回答 ID はすでにあれば無視する。保存した件数を返す */
  insert(userId: string, answers: Answer[], receivedAt: string): Promise<number>;
  /** その利用者の記録を全部消す */
  deleteAll(userId: string): Promise<void>;
}

type Row = { id: string; statement_id: string; ok: number; answered_at: string; received_at: string };

export class D1AnswerRepository implements AnswerRepository {
  constructor(private readonly db: D1Database) {}

  async list(userId: string, since?: string): Promise<StoredAnswer[]> {
    const stmt = since
      ? this.db
          .prepare("SELECT id, statement_id, ok, answered_at, received_at FROM answers WHERE user_id = ? AND received_at > ? ORDER BY received_at, id")
          .bind(userId, since)
      : this.db.prepare("SELECT id, statement_id, ok, answered_at, received_at FROM answers WHERE user_id = ? ORDER BY received_at, id").bind(userId);
    const { results } = await stmt.all<Row>();
    return results.map((r) => ({ id: r.id, s: r.statement_id, ok: r.ok === 1, at: r.answered_at, received_at: r.received_at }));
  }

  async insert(userId: string, answers: Answer[], receivedAt: string): Promise<number> {
    if (answers.length === 0) return 0;
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO answers (user_id, id, statement_id, ok, answered_at, received_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const res = await this.db.batch(answers.map((a) => stmt.bind(userId, a.id, a.s, a.ok ? 1 : 0, a.at, receivedAt)));
    return res.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
  }

  async deleteAll(userId: string): Promise<void> {
    await this.db.prepare("DELETE FROM answers WHERE user_id = ?").bind(userId).run();
  }
}

/** テスト用：メモリ上の実装 */
export class MemoryAnswerRepository implements AnswerRepository {
  rows = new Map<string, StoredAnswer[]>();

  async list(userId: string, since?: string): Promise<StoredAnswer[]> {
    return (this.rows.get(userId) ?? []).filter((r) => !since || r.received_at > since);
  }

  async insert(userId: string, answers: Answer[], receivedAt: string): Promise<number> {
    const mine = this.rows.get(userId) ?? [];
    const have = new Set(mine.map((r) => r.id));
    let n = 0;
    for (const a of answers) {
      if (have.has(a.id)) continue;
      mine.push({ ...a, received_at: receivedAt });
      have.add(a.id);
      n++;
    }
    this.rows.set(userId, mine);
    return n;
  }

  async deleteAll(userId: string): Promise<void> {
    this.rows.delete(userId);
  }
}
