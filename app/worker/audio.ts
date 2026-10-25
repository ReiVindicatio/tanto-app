// 聞き流しの音声（T058）：/audio/tts/<声>/<カード ID>.q.mp3 などを R2 から返す。
// 音声は手元で Google Cloud Text-to-Speech で作って上げてある（pipeline/tts.py・tts_upload.py）。
// iPhone の Safari は音声を Range 付きで取りに来るので、Range に答える（206）
const KEY = /^tts\/[A-Za-z0-9-]+\/[a-z0-9-]+\.(q|a)\.mp3$/;
const CACHE_CONTROL = "public, max-age=86400";

type Bucket = Pick<R2Bucket, "get">;
type Cache = Pick<globalThis.Cache, "match" | "put">;

export async function serveAudio(req: Request, bucket: Bucket | undefined, cache?: Cache, wait?: (p: Promise<unknown>) => void): Promise<Response> {
  const key = new URL(req.url).pathname.replace(/^\/audio\//, "");
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
  if (!bucket || !KEY.test(key)) return new Response("not found", { status: 404 });

  // Cloudflare のキャッシュにあればそこから返す（Range も Cloudflare が切り出す）
  const hit = await cache?.match(req);
  if (hit) return hit;

  const range = req.headers.get("range");
  const obj = await bucket.get(key, range ? { range: req.headers } : undefined);
  if (!obj) return new Response("not found", { status: 404 });

  const headers = new Headers({
    "content-type": "audio/mpeg",
    "accept-ranges": "bytes",
    "cache-control": CACHE_CONTROL,
    etag: obj.httpEtag,
  });
  const body = req.method === "HEAD" ? null : (obj as R2ObjectBody).body;
  if (range && obj.range) {
    const r = obj.range as { offset?: number; length?: number; suffix?: number };
    const offset = r.suffix !== undefined ? obj.size - r.suffix : (r.offset ?? 0);
    const length = r.suffix !== undefined ? r.suffix : (r.length ?? obj.size - offset);
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("content-length", String(length));
    return new Response(body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  const res = new Response(body, { headers });
  if (cache && req.method === "GET") {
    const put = cache.put(req, res.clone());
    if (wait) wait(put);
    else await put;
  }
  return res;
}
