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

/** 1つの SQL で保存する回答の数（1,000件でも SQL は5回。D1 の無料プランの上限50回に収まる） */
export const INSERT_CHUNK = 200;
const INSERT_SQL =
  "INSERT OR IGNORE INTO answers (user_id, id, statement_id, ok, answered_at, received_at) " +
  "SELECT ?1, json_extract(value, '$.id'), json_extract(value, '$.s'), json_extract(value, '$.ok'), json_extract(value, '$.at'), ?2 " +
  "FROM json_each(?3)";

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
    // D1 の無料プランは「1回の呼び出しで SQL 50回まで」「1つの SQL に渡せる値は100個まで」「SQL 文は100KBまで」。
    // 回答を1件ずつ INSERT すると50件を超えた時点で失敗するので、回答の一覧を JSON 文字列1つで渡し、
    // json_each で行に展開して1つの SQL で保存する（渡す値は3つ）。念のため INSERT_CHUNK 件ずつに分ける
    const stmts = [];
    for (let i = 0; i < answers.length; i += INSERT_CHUNK) {
      const chunk = answers.slice(i, i + INSERT_CHUNK).map((a) => ({ id: a.id, s: a.s, ok: a.ok ? 1 : 0, at: a.at }));
      stmts.push(this.db.prepare(INSERT_SQL).bind(userId, receivedAt, JSON.stringify(chunk)));
    }
    const res = await this.db.batch(stmts);
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
