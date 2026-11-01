"""律の特別な衣装の動き（docs/ritsu-special-costumes.md）：選んだ絵から、動画モデル（Veo）で数秒の動画を作る。

  python3 pipeline/ritsu_video.py <衣装ID> <entrance|finish|small> <元の絵の png> [--seconds 6] [--aspect 9:16]

- キーは .secrets/google-vertex-key（声1・画像と同じ）。請求は Google Cloud のクレジット
- 出力は audio/samples_char/video/（git では管理しない）
- 動きの指示は pipeline/ritsu_special.json の moves
"""
from __future__ import annotations

import base64
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from common import ROOT
from tts_gemini import vertex_key

OUT = ROOT / "audio" / "samples_char" / "video"
PROJECT = "344821173333"
REGION = "us-central1"
MODELS = ["veo-3.1-fast-generate-001", "veo-3.0-fast-generate-001"]
STYLE = ("Keep the exact anime illustration style, line art and colors of the input image; the character's face, hair and outfit must stay exactly the same "
         "throughout. Smooth gentle animation, no text, no letters, no extra people. ")


def post(url: str, body: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": vertex_key()})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def generate(prompt: str, image: Path, out: Path, seconds: int, aspect: str) -> None:
    body = {
        "instances": [{"prompt": prompt, "image": {"bytesBase64Encoded": base64.b64encode(image.read_bytes()).decode(), "mimeType": "image/png"}}],
        "parameters": {"sampleCount": 1, "durationSeconds": seconds, "aspectRatio": aspect, "generateAudio": False, "resolution": "720p"},
    }
    base = f"https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/publishers/google/models/"
    for model in MODELS:
        try:
            op = post(f"{base}{model}:predictLongRunning", body)
            break
        except urllib.error.HTTPError as e:
            print(f"  {model}: HTTP {e.code} {e.read()[:300].decode(errors='replace')}", flush=True)
    else:
        raise SystemExit("どのモデルも呼べなかった")
    print(f"  モデル {model}・作成中…", flush=True)
    t0 = time.time()
    while True:
        time.sleep(15)
        res = post(f"{base}{model}:fetchPredictOperation", {"operationName": op["name"]})
        if res.get("done"):
            break
        if time.time() - t0 > 600:
            raise SystemExit("10分たっても終わらなかった")
    print(f"  {time.time() - t0:.0f}秒", flush=True)
    if "error" in res:
        raise SystemExit(f"失敗：{json.dumps(res['error'], ensure_ascii=False)[:500]}")
    r = res.get("response", {})
    videos = r.get("videos") or []
    if not videos:
        raise SystemExit(f"動画が返ってこなかった：{json.dumps(r, ensure_ascii=False)[:500]}")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(base64.b64decode(videos[0]["bytesBase64Encoded"]))
    print(f"✅ {out.relative_to(ROOT)}（{out.stat().st_size // 1024}KB・{seconds}秒）", flush=True)


def main() -> None:
    cid, move, image = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    opt = lambda name, default: sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default
    design = json.loads((ROOT / "pipeline" / "ritsu_special.json").read_text(encoding="utf-8"))
    c = next(x for x in design["costumes"] if x["id"] == cid)
    generate(STYLE + c["moves"][move], image, OUT / f"{cid}-{move}.mp4", int(opt("--seconds", "6")), opt("--aspect", "9:16"))


if __name__ == "__main__":
    main()
