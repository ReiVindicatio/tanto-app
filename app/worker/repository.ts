// 回答ログの保存処理（T003）。DB を知っているのはこのファイルだけ。
// DB を入れ替えるときは AnswerRepository の実装を足し、index.ts で渡す（決定012）。

/** API とアプリの間でやりとりする回答1件（アプリ側の Answer と同じ形） */
export type Answer = { id: string; s: string; ok: boolean; at: string };
/** サーバーに保存された回答（受け取った日時つき） */
export type StoredAnswer = Answer & { received_at: string };
/** 誤り報告（T040） */
export type Report = { id: string; target: string; kind: string; body: string; context: string };
/** ★の操作1件（T026）。on：true＝付けた、false＝外した */
export type Bookmark = { id: string; s: string; on: boolean; at: string };
export type StoredBookmark = Bookmark & { received_at: string };

export interface AnswerRepository {
  /** その利用者の回答ログ。since を渡すと、それより後に受け取った分だけ */
  list(userId: string, since?: string): Promise<StoredAnswer[]>;
  /** 回答を保存する。同じ回答 ID はすでにあれば無視する。保存した件数を返す */
  insert(userId: string, answers: Answer[], receivedAt: string): Promise<number>;
  /** その利用者の記録を全部消す。誤り報告は消さず、送った人だけ消す（T040） */
  deleteAll(userId: string): Promise<void>;
  /** since 以降に受け取った、その利用者の回答の数（1日の上限：T040） */
  countAnswersSince(userId: string, since: string): Promise<number>;
  /** 誤り報告を保存する。同じ報告 ID はすでにあれば無視する（T040） */
  insertReport(userId: string, report: Report, createdAt: string): Promise<void>;
  /** since 以降に受け取った、その利用者の報告の数（T040） */
  countReportsSince(userId: string, since: string): Promise<number>;
  /** ★の操作。since を渡すと、それより後に受け取った分だけ（T026） */
  listBookmarks(userId: string, since?: string): Promise<StoredBookmark[]>;
  /** ★の操作を保存する。同じ操作 ID はすでにあれば無視する。保存した件数を返す（T026） */
  insertBookmarks(userId: string, bookmarks: Bookmark[], receivedAt: string): Promise<number>;
  /** since 以降に受け取った、その利用者の★の操作の数（1日の上限：T026） */
  countBookmarksSince(userId: string, since: string): Promise<number>;
}

/** 1つの SQL で保存する回答の数（1,000件でも SQL は5回。D1 の無料プランの上限50回に収まる） */
export const INSERT_CHUNK = 200;
const INSERT_SQL =
  "INSERT OR IGNORE INTO answers (user_id, id, statement_id, ok, answered_at, received_at) " +
  "SELECT ?1, json_extract(value, '$.id'), json_extract(value, '$.s'), json_extract(value, '$.ok'), json_extract(value, '$.at'), ?2 " +
  "FROM json_each(?3)";

const INSERT_BOOKMARKS_SQL =
  "INSERT OR IGNORE INTO bookmarks (user_id, id, statement_id, marked, marked_at, received_at) " +
  "SELECT ?1, json_extract(value, '$.id'), json_extract(value, '$.s'), json_extract(value, '$.on'), json_extract(value, '$.at'), ?2 " +
  "FROM json_each(?3)";

type Row = { id: string; statement_id: string; ok: number; answered_at: string; received_at: string };
type BookmarkRow = { id: string; statement_id: string; marked: number; marked_at: string; received_at: string };

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
    await this.db.batch([
      this.db.prepare("DELETE FROM answers WHERE user_id = ?").bind(userId),
      this.db.prepare("DELETE FROM bookmarks WHERE user_id = ?").bind(userId),
      this.db.prepare("UPDATE reports SET user_id = NULL WHERE user_id = ?").bind(userId),
    ]);
  }

  async countAnswersSince(userId: string, since: string): Promise<number> {
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM answers WHERE user_id = ? AND received_at >= ?").bind(userId, since).first<{ n: number }>();
    return r?.n ?? 0;
  }

  async insertReport(userId: string, r: Report, createdAt: string): Promise<void> {
    await this.db
      .prepare("INSERT OR IGNORE INTO reports (id, user_id, target, kind, body, context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(r.id, userId, r.target, r.kind, r.body, r.context, createdAt)
      .run();
  }

  async countReportsSince(userId: string, since: string): Promise<number> {
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM reports WHERE user_id = ? AND created_at >= ?").bind(userId, since).first<{ n: number }>();
    return r?.n ?? 0;
  }

  async listBookmarks(userId: string, since?: string): Promise<StoredBookmark[]> {
    const cols = "SELECT id, statement_id, marked, marked_at, received_at FROM bookmarks WHERE user_id = ?";
    const stmt = since
      ? this.db.prepare(`${cols} AND received_at > ? ORDER BY received_at, id`).bind(userId, since)
      : this.db.prepare(`${cols} ORDER BY received_at, id`).bind(userId);
    const { results } = await stmt.all<BookmarkRow>();
    return results.map((r) => ({ id: r.id, s: r.statement_id, on: r.marked === 1, at: r.marked_at, received_at: r.received_at }));
  }

  async insertBookmarks(userId: string, bookmarks: Bookmark[], receivedAt: string): Promise<number> {
    if (bookmarks.length === 0) return 0;
    // 回答と同じく、JSON 文字列1つで渡して json_each で展開する（D1 の SQL 回数・値の数の上限）
    const stmts = [];
    for (let i = 0; i < bookmarks.length; i += INSERT_CHUNK) {
      const chunk = bookmarks.slice(i, i + INSERT_CHUNK).map((b) => ({ id: b.id, s: b.s, on: b.on ? 1 : 0, at: b.at }));
      stmts.push(this.db.prepare(INSERT_BOOKMARKS_SQL).bind(userId, receivedAt, JSON.stringify(chunk)));
    }
    const res = await this.db.batch(stmts);
    return res.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
  }

  async countBookmarksSince(userId: string, since: string): Promise<number> {
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM bookmarks WHERE user_id = ? AND received_at >= ?").bind(userId, since).first<{ n: number }>();
    return r?.n ?? 0;
  }
}

/** テスト用：メモリ上の実装 */
export class MemoryAnswerRepository implements AnswerRepository {
  rows = new Map<string, StoredAnswer[]>();
  bookmarks = new Map<string, StoredBookmark[]>();
  reports: (Report & { user_id: string | null; created_at: string })[] = [];

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
    this.bookmarks.delete(userId);
    for (const r of this.reports) if (r.user_id === userId) r.user_id = null;
  }

  async countAnswersSince(userId: string, since: string): Promise<number> {
    return (this.rows.get(userId) ?? []).filter((r) => r.received_at >= since).length;
  }

  async insertReport(userId: string, r: Report, createdAt: string): Promise<void> {
    if (this.reports.some((x) => x.id === r.id)) return;
    this.reports.push({ ...r, user_id: userId, created_at: createdAt });
  }

  async countReportsSince(userId: string, since: string): Promise<number> {
    return this.reports.filter((r) => r.user_id === userId && r.created_at >= since).length;
  }

  async listBookmarks(userId: string, since?: string): Promise<StoredBookmark[]> {
    return (this.bookmarks.get(userId) ?? []).filter((r) => !since || r.received_at > since);
  }

  async insertBookmarks(userId: string, bookmarks: Bookmark[], receivedAt: string): Promise<number> {
    const mine = this.bookmarks.get(userId) ?? [];
    const have = new Set(mine.map((r) => r.id));
    let n = 0;
    for (const b of bookmarks) {
      if (have.has(b.id)) continue;
      mine.push({ ...b, received_at: receivedAt });
      have.add(b.id);
      n++;
    }
    this.bookmarks.set(userId, mine);
    return n;
  }

  async countBookmarksSince(userId: string, since: string): Promise<number> {
    return (this.bookmarks.get(userId) ?? []).filter((r) => r.received_at >= since).length;
  }
}
