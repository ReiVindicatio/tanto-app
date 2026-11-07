// Cloudflare Worker の入口（T003）。/api/* だけを処理し、それ以外は静的ファイル（アプリ）を返す。
import { handleApi, type Limiter } from "./api";
import { firebaseEmail, firebaseVerifier, testVerifier } from "./auth";
import { D1AnswerRepository } from "./repository";
import { serveAudio } from "./audio";
import { serveSpecial } from "./special";

/** Cloudflare Workers の Rate Limiting（wrangler.jsonc の ratelimits） */
type RateLimit = { limit(opts: { key: string }): Promise<{ success: boolean }> };

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  ENVIRONMENT: string; // "production"（wrangler.jsonc）／"development"（.dev.vars）
  AUTH_MODE?: string; // "test" は手元の開発環境（.dev.vars）でだけ使う
  /** 使いすぎの制限（T040）。IP ごと・利用者ごと。設定がなければ制限しない */
  RL_IP?: RateLimit;
  RL_USER?: RateLimit;
  /** 聞き流しの音声（T058）。設定がなければ /audio/* は 404（アプリは端末の読み上げに戻る） */
  AUDIO?: R2Bucket;
  /** 管理者のメール（T068。カンマ区切り）。リポジトリが公開なので wrangler secret で置き、コードに書かない */
  ADMIN_EMAILS?: string;
  /** 特別な衣装の通行証の署名の鍵（T069。wrangler secret）。なければ /special/* はだれにも渡さない */
  SPECIAL_KEY?: string;
  /** "off" ならベータ版の特典（T074）を渡さない。同期の E2E だけで使う（お試しを確かめるため） */
  EARLY_ACCESS?: string;
}

function limiter(rl?: RateLimit): Limiter | undefined {
  if (!rl) return undefined;
  return async (key) => {
    try {
      return (await rl.limit({ key })).success;
    } catch {
      return true; // 制限の仕組みが不調なときは通す（安全網なので、正当な利用を止めない）
    }
  };
}

/** セキュリティの基本のヘッダー（T075）。静的なファイルには public/_headers で同じものを付ける（ここを変えたら、あちらも変える） */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

/** Worker が作った応答にヘッダーを足す。キャッシュから返した応答は書き換えられないので、作り直す */
function secured(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/audio/")) {
      const cache = typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : undefined;
      return secured(await serveAudio(req, env.AUDIO, cache, ctx ? (p) => ctx.waitUntil(p) : undefined));
    }
    if (url.pathname.startsWith("/special/")) return secured(await serveSpecial(req, env.AUDIO, env.SPECIAL_KEY));
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    const testMode = env.AUTH_MODE === "test";
    if (testMode && env.ENVIRONMENT === "production") {
      // 本番でテスト用ログインが有効になっていたら、API を止める（設定の取り違えへの備え）
      return new Response("misconfigured: test auth in production", { status: 500 });
    }
    const verify = testMode ? testVerifier() : firebaseVerifier(env.FIREBASE_PROJECT_ID);
    return secured(await handleApi(req, {
      repo: new D1AnswerRepository(env.DB),
      verify,
      limitIp: limiter(env.RL_IP),
      limitUser: limiter(env.RL_USER),
      emailOf: testMode ? undefined : firebaseEmail(env.FIREBASE_PROJECT_ID),
      adminEmails: env.ADMIN_EMAILS,
      specialKey: env.SPECIAL_KEY,
      earlyAccess: env.EARLY_ACCESS === "off" ? null : undefined,
    }));
  },
} satisfies ExportedHandler<Env>;
