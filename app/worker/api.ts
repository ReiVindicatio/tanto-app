// /api/* の処理（T003）。保存処理（AnswerRepository）と検証（Verifier）を受け取るだけで、
// D1 や Firebase を直接は知らない（テストでは偽物を渡す）。
import type { Answer, AnswerRepository } from "./repository";
import type { Verifier } from "./auth";

export const MAX_BATCH = 1000;
const STATEMENT_ID = /^(yobi|shiho)-\d{4}-[a-z]+-q\d{2}(-\d+)?-[a-z0-9]+$/;
const ANSWER_ID = /^[A-Za-z0-9-]{1,64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export type Deps = { repo: AnswerRepository; verify: Verifier; now?: () => Date };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

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

export async function handleApi(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const userId = token ? await deps.verify(token) : null;
  if (!userId) return json({ error: "unauthorized" }, 401);

  if (url.pathname === "/api/answers" && req.method === "GET") {
    const since = url.searchParams.get("since") ?? undefined;
    if (since && !ISO.test(since)) return json({ error: "bad since" }, 400);
    const answers = await deps.repo.list(userId, since);
    return json({ answers });
  }

  if (url.pathname === "/api/answers" && req.method === "POST") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const list = (body as { answers?: unknown })?.answers;
    if (!Array.isArray(list)) return json({ error: "answers must be an array" }, 400);
    if (list.length > MAX_BATCH) return json({ error: `too many answers (max ${MAX_BATCH})` }, 400);
    if (!list.every(validAnswer)) return json({ error: "invalid answer" }, 400);
    const receivedAt = (deps.now?.() ?? new Date()).toISOString();
    const inserted = await deps.repo.insert(userId, list, receivedAt);
    return json({ inserted, received_at: receivedAt });
  }

  if (url.pathname === "/api/me" && req.method === "DELETE") {
    await deps.repo.deleteAll(userId);
    return json({ deleted: true });
  }

  return json({ error: "not found" }, 404);
}
