"""聞き流しの音声（T058）を Cloudflare R2 のバケット tantan-audio に上げる。

  python3 pipeline/tts_upload.py            # 上げていない・作り直した音声だけ上げる
  python3 pipeline/tts_upload.py --dry-run  # 上げる数だけ数える
  python3 pipeline/tts_upload.py --voice gemini-leda   # 声2（T061）

- `wrangler r2 object put`（app/ の wrangler でログイン済みのもの）を並べて流す。新しい鍵は要らない
- audio/tts/<声>/uploaded.json に、上げたファイルの sha256（manifest.json と同じ値）を残す。同じなら上げ直さない
- R2 のキーは tts/<声>/<ファイル名>。アプリは /audio/tts/<声>/<ファイル名> で取りに行く（worker/audio.ts）
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from common import ROOT
from tts import VOICE, VOICES, out_dir

BUCKET = "tantan-audio"
APP = ROOT / "app"
WORKERS = 8


def put(voice: str, name: str) -> None:
    r = subprocess.run(
        ["npx", "wrangler", "r2", "object", "put", f"{BUCKET}/tts/{voice}/{name}", f"--file={out_dir(voice) / name}",
         "--content-type=audio/mpeg", "--cache-control=public, max-age=86400", "--remote"],
        cwd=APP, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip().splitlines()[-1] if (r.stderr or r.stdout).strip() else f"exit {r.returncode}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--voice", choices=VOICES, default=VOICE)
    a = ap.parse_args()
    OUT = out_dir(a.voice)
    manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
    upath = OUT / "uploaded.json"
    uploaded: dict[str, str] = json.loads(upath.read_text(encoding="utf-8")) if upath.exists() else {}
    todo = [n for n, h in sorted(manifest.items()) if uploaded.get(n) != h and (OUT / n).exists()]
    if a.limit:
        todo = todo[:a.limit]
    print(f"上げる音声 {len(todo)}本（{BUCKET}/tts/{a.voice}/）")
    if a.dry_run or not todo:
        return
    lock = threading.Lock()
    failed: list[str] = []

    def save() -> None:
        upath.write_text(json.dumps(dict(sorted(uploaded.items())), indent=0) + "\n", encoding="utf-8")

    with ThreadPoolExecutor(WORKERS) as pool:
        futures = {pool.submit(put, a.voice, n): n for n in todo}
        for k, f in enumerate(as_completed(futures), 1):
            n = futures[f]
            try:
                f.result()
            except Exception as e:  # 1本の失敗で止めない。次に流せば上げ直す
                failed.append(f"{n}：{e}")
                continue
            with lock:
                uploaded[n] = manifest[n]
                if k % 100 == 0:
                    save()
                    print(f"  {k}/{len(todo)}", flush=True)
    save()
    for x in failed[:20]:
        print(f"❌ {x}")
    print(f"{'⚠️' if failed else '✅'} 上げた {len(todo) - len(failed)}本（失敗 {len(failed)}本）")


if __name__ == "__main__":
    sys.exit(main())
