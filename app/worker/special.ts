// 特別な衣装（T069）：絵・声・動画は R2 の special/ に置き、許された人にだけ渡す（リポジトリも app/public/ も公開なので、そこには置かない）。
// /api/me が通行証（署名つきの Cookie）を出し、/special/<衣装>/<ファイル> がそれを確かめる。img・video・audio は Authorization を付けられないので Cookie にする。
// 今許すのは管理者（全着）と、お試し中の人（T070。見本の1着だけ・48時間）。買えるようにするときは、/api/me で購入を確かめて通行証を出す
// 全身の絵（PUBLIC）だけは通行証なしで渡す。買う前に見せるのは、この1枚と名前と紹介文（docs/decisions/026）
import { objectResponse } from "./audio";

const COOKIE = "tanto_special";
const PASS_SECONDS = 7 * 24 * 3600;
const TRIAL_COOKIE = "tanto_trial";
/** お試しできる見本の1着（T070） */
export const TRIAL_COSTUME = "hoshiyomi";
export const TRIAL_SECONDS = 48 * 3600;
/** 特別な衣装の ID（「欲しい」で受け付けるもの） */
export const SPECIAL_COSTUMES = ["hoshiyomi", "hakama", "diva", "nocturne", "yukihana"];
const PUBLIC = /^[a-z0-9-]+\/base-smile\.webp$/;
const KEY = /^[a-z0-9-]+\/(voices\/)?[A-Za-z0-9_.-]+\.(webp|png|mp4|mp3)$/;
const TYPES: Record<string, string> = { webp: "image/webp", png: "image/png", mp4: "video/mp4", mp3: "audio/mpeg" };
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

/** お試しの通行証の Set-Cookie。1着だけ。署名は全着の通行証と別の文字列にかける（取り違えて使えないように） */
export async function trialCookie(userId: string, costume: string, expires: Date, key: string, now: Date): Promise<string> {
  const exp = Math.floor(expires.getTime() / 1000);
  const body = `${encodeURIComponent(userId)}.${costume}.${exp}`;
  const maxAge = exp - Math.floor(now.getTime() / 1000);
  return `${TRIAL_COOKIE}=${body}.${await sign(`trial.${body}`, key)}; Path=/special; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/** 通行証を消す Set-Cookie */
export const CLEAR_PASS = `${COOKIE}=; Path=/special; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
const CLEAR_TRIAL = `${TRIAL_COOKIE}=; Path=/special; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

function cookieValue(cookieHeader: string | null, name: string): string | undefined {
  return (cookieHeader ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function sameMac(signed: string, got: string, key: string): Promise<boolean> {
  const a = new TextEncoder().encode(await sign(signed, key));
  const b = new TextEncoder().encode(got);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** 通行証が本物で、期限の内か */
export async function validPass(cookieHeader: string | null, key: string, now: Date): Promise<boolean> {
  const value = cookieValue(cookieHeader, COOKIE);
  const m = value && /^([^.]+\.(\d+))\.([A-Za-z0-9_-]+)$/.exec(value);
  if (!m) return false;
  if (Number(m[2]) * 1000 <= now.getTime()) return false;
  return sameMac(m[1], m[3], key);
}

/** お試しの通行証が本物で、期限の内で、その衣装のファイルか */
export async function validTrial(cookieHeader: string | null, path: string, key: string, now: Date): Promise<boolean> {
  const value = cookieValue(cookieHeader, TRIAL_COOKIE);
  const m = value && /^([^.]+\.([a-z0-9-]+)\.(\d+))\.([A-Za-z0-9_-]+)$/.exec(value);
  if (!m || !path.startsWith(`${m[2]}/`)) return false;
  if (Number(m[3]) * 1000 <= now.getTime()) return false;
  return sameMac(`trial.${m[1]}`, m[4], key);
}

/** key が設定されていなければ、だれにも渡さない */
export async function serveSpecial(req: Request, bucket: Bucket | undefined, key: string | undefined, now = new Date()): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/^\/special\//, "");
  // ログアウト：Cookie は script から消せないので、サーバーで消す
  if (path === "logout" && req.method === "POST") {
    const headers = new Headers();
    headers.append("set-cookie", CLEAR_PASS);
    headers.append("set-cookie", CLEAR_TRIAL);
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
  const cookie = req.headers.get("cookie");
  if (!key || !(PUBLIC.test(path) || (await validPass(cookie, key, now)) || (await validTrial(cookie, path, key, now)))) return new Response("forbidden", { status: 403 });
  if (!bucket || !KEY.test(path) || path.includes("..")) return new Response("not found", { status: 404 });

  const range = req.headers.get("range");
  const obj = await bucket.get(`special/${path}`, range ? { range: req.headers } : undefined);
  if (!obj) return new Response("not found", { status: 404 });
  return objectResponse(req, obj, TYPES[path.slice(path.lastIndexOf(".") + 1)], CACHE_CONTROL);
}
