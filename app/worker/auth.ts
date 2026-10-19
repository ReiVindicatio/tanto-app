// ID トークンの検証（T003）。ログインそのものは Firebase Authentication に任せ、
// ここでは「誰か」を確かめるだけ（決定012）。
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/** トークンを検証し、利用者 ID（Firebase の uid）を返す。検証できなければ null */
export type Verifier = (token: string) => Promise<string | null>;

const GOOGLE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let remoteJwks: JWTVerifyGetKey | null = null;

/** Firebase の ID トークンを検証する（署名・発行者・対象・期限） */
export function firebaseVerifier(projectId: string, keys?: JWTVerifyGetKey): Verifier {
  const getKey = keys ?? (remoteJwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS)));
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, getKey, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        algorithms: ["RS256"],
      });
      return typeof payload.sub === "string" && payload.sub.length > 0 && payload.sub.length <= 128 ? payload.sub : null;
    } catch {
      return null;
    }
  };
}

/**
 * 手元の開発環境でだけ使う「テスト用ログイン」。トークン "test:<利用者ID>" を受け付ける。
 * 本番では使わない（index.ts が ENVIRONMENT=production では作らない）。
 */
export function testVerifier(): Verifier {
  return async (token) => {
    const m = /^test:([A-Za-z0-9_-]{1,64})$/.exec(token);
    return m ? `test-${m[1]}` : null;
  };
}
