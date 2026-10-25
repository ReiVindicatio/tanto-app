"""聞き流し（T057 の作り直し）の音声を、Google Cloud Text-to-Speech（Chirp 3 HD）で肢カードごとに作る。

  python3 pipeline/tts.py            # 足りない・文が変わった音声だけ作る（キーは GOOGLE_TTS_API_KEY か .secrets/google-tts-key）
  python3 pipeline/tts.py --dry-run  # 作る数と文字数だけ数える

- 1枚につき2本：<カード ID>.q.mp3（肢）と <カード ID>.a.mp3（「正解は、まる（ばつ）。」＋解説の結論）。
  アプリは q → 考える間 → a の順に流し、間に○×を押されたら a に進む
- 対象はアプリの聞き流しと同じ：名寄せの代表の肢カードで、○×があり、肢カードから外していない、前提文も小問も要らないもの
- 読む文はアプリと同じに作る（解答欄の番号を除き、読み間違えやすい語を読み替える。tts_sample.py と共有）
- audio/tts/<声>/manifest.json に、ファイルごとの読んだ文の sha256 を残す。文が同じなら作り直さない
- 出力は audio/（git では管理しない）。置き場所（R2 など）に上げるのは別の手順
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import threading
import time
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from common import ROOT
from tts_sample import DATA, speech_text, synth

VOICE = "ja-JP-Chirp3-HD-Achernar"  # 2026-10-25 に見本を聞いて決めた（Chirp 3 HD・女性）
OUT = ROOT / "audio" / "tts" / VOICE
WORKERS = 12  # 1本ずつの応答待ちが長い（約2.6秒）ので並べる。混みすぎたら 429 が返り、待ってやり直す


def listen_cards() -> list[dict]:
    idx = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    aliases = set(idx["aliases"])
    cards = []
    for info in idx["sets"]:
        d = json.loads((DATA / info["file"]).read_text(encoding="utf-8"))
        exp = {e["statement_id"]: e for e in d["explanations"]}
        for s in d["statements"]:
            if (not s.get("truth_at_exam") or s.get("review_flag") or s["id"] in aliases
                    or s.get("requires_context") or s.get("sub") is not None):
                continue
            e = exp.get(s["id"])
            mark = "まる" if s["truth_at_exam"]["value"] else "ばつ"
            cards.append({
                "id": s["id"],
                "q": speech_text(s["text"]),
                "a": speech_text(f"正解は、{mark}。" + (e["conclusion"] if e else "この肢の解説はありません。")),
            })
    return cards


def sha(t: str) -> str:
    return hashlib.sha256(t.encode("utf-8")).hexdigest()[:16]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="作る本数の上限（試しに少しだけ作るとき）")
    ap.add_argument("--workers", type=int, default=WORKERS)
    a = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    mpath = OUT / "manifest.json"
    manifest: dict[str, str] = json.loads(mpath.read_text(encoding="utf-8")) if mpath.exists() else {}
    jobs = []
    for c in listen_cards():
        for part in ("q", "a"):
            name = f"{c['id']}.{part}.mp3"
            if manifest.get(name) == sha(c[part]) and (OUT / name).exists():
                continue
            jobs.append((name, c[part]))
    if a.limit:
        jobs = jobs[:a.limit]
    chars = sum(len(t) for _, t in jobs)
    print(f"作る音声 {len(jobs)}本・{chars:,}字（声 {VOICE}）")
    if a.dry_run or not jobs:
        return

    lock = threading.Lock()
    done = 0
    started = time.time()

    def work(name: str, text: str) -> str:
        for attempt in range(6):
            try:
                synth(text, VOICE, OUT / name)
                return name
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < 5:
                    time.sleep(2 ** attempt)  # 混んでいるときは待ってやり直す
                    continue
                raise
        raise RuntimeError(name)

    def save() -> None:
        mpath.write_text(json.dumps(dict(sorted(manifest.items())), ensure_ascii=False, indent=0) + "\n", encoding="utf-8")

    texts = dict(jobs)
    failed: list[str] = []
    with ThreadPoolExecutor(a.workers) as pool:
        futures = {pool.submit(work, n, t): n for n, t in jobs}
        for f in as_completed(futures):
            try:
                name = f.result()
            except Exception as e:  # 1本の失敗で全体を止めない。最後にまとめて出す
                failed.append(f"{futures[f]}：{e}")
                continue
            with lock:
                manifest[name] = sha(texts[name])
                done += 1
                if done % 50 == 0 or done == len(jobs):
                    save()
                    rate = done / (time.time() - started)
                    print(f"  {done}/{len(jobs)}（残り約{(len(jobs) - done) / rate / 60:.0f}分）", flush=True)
    save()
    for x in failed:
        print(f"❌ {x}")
    print(f"{'⚠️' if failed else '✅'} {OUT.relative_to(ROOT)}：{len(manifest)}本（失敗 {len(failed)}本）")


if __name__ == "__main__":
    sys.exit(main())
