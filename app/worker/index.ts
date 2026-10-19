// Cloudflare Worker の入口（T003）。/api/* だけを処理し、それ以外は静的ファイル（アプリ）を返す。
import { handleApi } from "./api";
import { firebaseVerifier, testVerifier } from "./auth";
import { D1AnswerRepository } from "./repository";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  ENVIRONMENT: string; // "production"（wrangler.jsonc）／"development"（.dev.vars）
  AUTH_MODE?: string; // "test" は手元の開発環境（.dev.vars）でだけ使う
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    const testMode = env.AUTH_MODE === "test";
    if (testMode && env.ENVIRONMENT === "production") {
      // 本番でテスト用ログインが有効になっていたら、API を止める（設定の取り違えへの備え）
      return new Response("misconfigured: test auth in production", { status: 500 });
    }
    const verify = testMode ? testVerifier() : firebaseVerifier(env.FIREBASE_PROJECT_ID);
    return handleApi(req, { repo: new D1AnswerRepository(env.DB), verify });
  },
} satisfies ExportedHandler<Env>;
