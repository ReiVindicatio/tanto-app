// /api/* の処理（T003・T040）。保存処理（AnswerRepository）と検証（Verifier）を受け取るだけで、
// D1 や Firebase を直接は知らない（テストでは偽物を渡す）。
import type { Answer, AnswerRepository, Bookmark, Report } from "./repository";
import type { Verifier } from "./auth";

export const MAX_BATCH = 1000;
/** 1日（UTC）に受け取る回答の上限（T040）。初めてログインした端末の記録をまとめて送る（引き継ぎ）のを止めない値。超えた分は翌日に送られる */
export const DAILY_ANSWERS = 20_000;
/** 1日（UTC）に受け取る★の操作の上限（T026） */
export const DAILY_BOOKMARKS = 5_000;
/** 1日（UTC）に受け取る誤り報告の上限（T040） */
export const DAILY_REPORTS = 50;
export const REPORT_BODY_MAX = 500;
const CONTEXT_MAX = 2000;
const STATEMENT_ID = /^(yobi|shiho)-\d{4}-[a-z]+-q\d{2}(-\d+)?-[a-z0-9]+$/;
const QUESTION_ID = /^(yobi|shiho)-\d{4}-[a-z]+-q\d{2}$/;
const ANSWER_ID = /^[A-Za-z0-9-]{1,64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
export const REPORT_KINDS = ["question", "truth", "explanation", "other"] as const;

/**
 * 使いすぎの制限（T040：見えない安全網）。key ごとに、許すなら true。
 * 本番は Cloudflare の Rate Limiting（拠点ごとの概算）。人の手では届かない値にしてある
 */
export type Limiter = (key: string) => Promise<boolean>;
export type Deps = { repo: AnswerRepository; verify: Verifier; now?: () => Date; limitIp?: Limiter; limitUser?: Limiter };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

/** 上限に達した（アプリは画面に出さず、あとで送り直す） */
const tooMany = () => json({ error: "too many requests" }, 429);

export function validAnswer(a: unknown): a is Answer {
  if (!a || typeof a !== "object") return false;
  const x = a as Record<string, unknown>;
  return (
    typeof x.id === "string" && ANSWER_ID.test(x.id) &&
    typeof x.s === "string" && STATEMENT_ID.test(x.s) &&
    typeof x.ok === "boolean" &&
    typeof x.at === "string" && ISO.test(x.at) && !Number.isNaN(Date.parse(x.at))
  );
}

export function validBookmark(b: unknown): b is Bookmark {
  if (!b || typeof b !== "object") return false;
  const x = b as Record<string, unknown>;
  return (
    typeof x.id === "string" && ANSWER_ID.test(x.id) &&
    typeof x.s === "string" && STATEMENT_ID.test(x.s) &&
    typeof x.on === "boolean" &&
    typeof x.at === "string" && ISO.test(x.at) && !Number.isNaN(Date.parse(x.at))
  );
}

export function validReport(r: unknown): r is Report {
  if (!r || typeof r !== "object") return false;
  const x = r as Record<string, unknown>;
  return (
    typeof x.id === "string" && ANSWER_ID.test(x.id) &&
    typeof x.target === "string" && (STATEMENT_ID.test(x.target) || QUESTION_ID.test(x.target)) &&
    typeof x.kind === "string" && (REPORT_KINDS as readonly string[]).includes(x.kind) &&
    typeof x.body === "string" && x.body.trim().length > 0 && [...x.body].length <= REPORT_BODY_MAX &&
    typeof x.context === "string" && x.context.length <= CONTEXT_MAX
  );
}

/** その日（UTC）の始まり */
function startOfDay(d: Date): string {
  return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export async function handleApi(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const ip = req.headers.get("cf-connecting-ip") ?? "";
  if (deps.limitIp && ip && !(await deps.limitIp(`ip:${ip}`))) return tooMany();

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const userId = token ? await deps.verify(token) : null;
  if (!userId) return json({ error: "unauthorized" }, 401);
  if (deps.limitUser && !(await deps.limitUser(`user:${userId}`))) return tooMany();
  const now = deps.now?.() ?? new Date();

  if (url.pathname === "/api/answers" && req.method === "GET") {
    const since = url.searchParams.get("since") ?? undefined;
    if (since && !ISO.test(since)) return json({ error: "bad since" }, 400);
    const answers = await deps.repo.list(userId, since);
    const bookmarks = await deps.repo.listBookmarks(userId, since);
    return json({ answers, bookmarks });
  }

  if (url.pathname === "/api/answers" && req.method === "POST") {
    const body = await readJson(req);
    if (body === undefined) return json({ error: "bad json" }, 400);
    const list = (body as { answers?: unknown })?.answers;
    if (!Array.isArray(list)) return json({ error: "answers must be an array" }, 400);
    if (list.length > MAX_BATCH) return json({ error: `too many answers (max ${MAX_BATCH})` }, 400);
    if (!list.every(validAnswer)) return json({ error: "invalid answer" }, 400);
    // ★の操作（T026）は回答と同じ呼び出しで送る（API の呼び出しを増やさない：T021）。省略してよい
    const marks = (body as { bookmarks?: unknown })?.bookmarks ?? [];
    if (!Array.isArray(marks)) return json({ error: "bookmarks must be an array" }, 400);
    if (marks.length > MAX_BATCH) return json({ error: `too many bookmarks (max ${MAX_BATCH})` }, 400);
    if (!marks.every(validBookmark)) return json({ error: "invalid bookmark" }, 400);
    const today = startOfDay(now);
    if (list.length > 0 && (await deps.repo.countAnswersSince(userId, today)) + list.length > DAILY_ANSWERS) return tooMany();
    if (marks.length > 0 && (await deps.repo.countBookmarksSince(userId, today)) + marks.length > DAILY_BOOKMARKS) return tooMany();
    const receivedAt = now.toISOString();
    const inserted = await deps.repo.insert(userId, list, receivedAt);
    const bookmarksInserted = await deps.repo.insertBookmarks(userId, marks, receivedAt);
    return json({ inserted, bookmarks_inserted: bookmarksInserted, received_at: receivedAt });
  }

  if (url.pathname === "/api/reports" && req.method === "POST") {
    const body = await readJson(req);
    if (body === undefined) return json({ error: "bad json" }, 400);
    if (!validReport(body)) return json({ error: "invalid report" }, 400);
    if ((await deps.repo.countReportsSince(userId, startOfDay(now))) >= DAILY_REPORTS) return tooMany();
    const { id, target, kind, body: text, context } = body;
    await deps.repo.insertReport(userId, { id, target, kind, body: text.trim(), context }, now.toISOString());
    return json({ received: true });
  }

  if (url.pathname === "/api/me" && req.method === "DELETE") {
    await deps.repo.deleteAll(userId);
    return json({ deleted: true });
  }

  return json({ error: "not found" }, 404);
}
