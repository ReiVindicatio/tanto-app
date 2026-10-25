import { describe, expect, it } from "vitest";
import { serveAudio } from "./audio";

const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
// R2 の get の作り物：range が Headers のときは「bytes=2-5」だけ解釈する
const bucket = {
  async get(key: string, opts?: { range?: Headers }) {
    if (key !== "tts/v/yobi-2026-minpo-q01-a.q.mp3") return null;
    let slice = bytes;
    let range: { offset: number; length: number } | undefined;
    const h = opts?.range?.get("range");
    if (h) {
      const [a, b] = h.replace("bytes=", "").split("-").map(Number);
      range = { offset: a, length: b - a + 1 };
      slice = bytes.slice(a, b + 1);
    }
    return { size: bytes.length, httpEtag: '"e"', range, body: new Blob([slice]).stream() };
  },
} as unknown as R2Bucket;

const req = (path: string, headers: Record<string, string> = {}) => new Request(`https://x.test${path}`, { headers });

describe("聞き流しの音声（T058）", () => {
  it("R2 にある音声を返す", async () => {
    const res = await serveAudio(req("/audio/tts/v/yobi-2026-minpo-q01-a.q.mp3"), bucket);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it("Range には 206 で答える（iPhone の Safari）", async () => {
    const res = await serveAudio(req("/audio/tts/v/yobi-2026-minpo-q01-a.q.mp3", { range: "bytes=2-5" }), bucket);
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([3, 4, 5, 6]));
  });

  it("ない音声・形の違うパス・バケットの設定がないときは 404", async () => {
    expect((await serveAudio(req("/audio/tts/v/yobi-2026-minpo-q01-b.q.mp3"), bucket)).status).toBe(404);
    expect((await serveAudio(req("/audio/../secret"), bucket)).status).toBe(404);
    expect((await serveAudio(req("/audio/tts/v/yobi-2026-minpo-q01-a.q.mp3"), undefined)).status).toBe(404);
  });
});
