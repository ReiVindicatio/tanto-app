// 特別な衣装（T069）：絵・声・動画は R2 の special/ に置き、許された人にだけ渡す（リポジトリも app/public/ も公開なので、そこには置かない）。
// /api/me が通行証（署名つきの Cookie）を出し、/special/<衣装>/<ファイル> がそれを確かめる。img・video・audio は Authorization を付けられないので Cookie にする。
// 今許すのは管理者だけ。買えるようにするときは、/api/me で購入を確かめて通行証を出す
import { objectResponse } from "./audio";

const COOKIE = "tanto_special";
const PASS_SECONDS = 7 * 24 * 3600;
const KEY = /^[a-z0-9-]+\/(voices\/)?[A-Za-z0-9_.-]+\.(webp|mp4|mp3)$/;
const TYPES: Record<string, string> = { webp: "image/webp", mp4: "video/mp4", mp3: "audio/mpeg" };
// 共有のキャッシュ（Cloudflare）には載せない。端末のブラウザにだけ残す
const CACHE_CONTROL = "private, max-age=86400";

type Bucket = Pick<R2Bucket, "get">;

async function sign(body: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 通行証の Set-Cookie。script からは読めない（HttpOnly）。ほかのサイトからの読み込みには付かない（SameSite） */
export async function passCookie(userId: string, key: string, now: Date): Promise<string> {
  const body = `${encodeURIComponent(userId)}.${Math.floor(now.getTime() / 1000) + PASS_SECONDS}`;
  return `${COOKIE}=${body}.${await sign(body, key)}; Path=/special; Max-Age=${PASS_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

/** 通行証を消す Set-Cookie */
export const CLEAR_PASS = `${COOKIE}=; Path=/special; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** 通行証が本物で、期限の内か */
export async function validPass(cookieHeader: string | null, key: string, now: Date): Promise<boolean> {
  const value = (cookieHeader ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const m = value && /^([^.]+\.(\d+))\.([A-Za-z0-9_-]+)$/.exec(value);
  if (!m) return false;
  if (Number(m[2]) * 1000 <= now.getTime()) return false;
  const expected = new TextEncoder().encode(await sign(m[1], key));
  const got = new TextEncoder().encode(m[3]);
  if (expected.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= expected[i] ^ got[i];
  return diff === 0;
}

/** key が設定されていなければ、だれにも渡さない */
export async function serveSpecial(req: Request, bucket: Bucket | undefined, key: string | undefined, now = new Date()): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/^\/special\//, "");
  // ログアウト：Cookie は script から消せないので、サーバーで消す
  if (path === "logout" && req.method === "POST") return new Response(null, { status: 204, headers: { "set-cookie": CLEAR_PASS } });
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
  if (!key || !(await validPass(req.headers.get("cookie"), key, now))) return new Response("forbidden", { status: 403 });
  if (!bucket || !KEY.test(path) || path.includes("..")) return new Response("not found", { status: 404 });

  const range = req.headers.get("range");
  const obj = await bucket.get(`special/${path}`, range ? { range: req.headers } : undefined);
  if (!obj) return new Response("not found", { status: 404 });
  return objectResponse(req, obj, TYPES[path.slice(path.lastIndexOf(".") + 1)], CACHE_CONTROL);
}
