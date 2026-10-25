"""聞き流し（T057 の作り直し）の声の聞き比べ用の見本を作る。Google Cloud Text-to-Speech で、肢と「正解は〜」＋解説の結論を読む。

  GOOGLE_TTS_API_KEY=... python3 pipeline/tts_sample.py        # または .secrets/google-tts-key にキーを1行で置く

- 出力は audio/samples/（git では管理しない）。声ごとに、肢 → 3秒の間 → 答えと結論 を1本につないだ mp3 と、
  聞き比べ用の index.html を作る
- 読み上げる文は、アプリの聞き流しと同じに作る（解答欄の番号を除き、読み間違えやすい語を読み替える）
- キーはこのリポジトリに commit しない（.secrets/ は .gitignore 済み）。キーは手元でだけ使い、サーバーには置かない
"""
from __future__ import annotations

import base64
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

from common import ROOT

DATA = ROOT / "app" / "public" / "data"
OUT = ROOT / "audio" / "samples"
API = "https://texttospeech.googleapis.com/v1"
# app/src/listen.ts の READINGS と同じ（読み間違えやすい語）
READINGS = [("瑕疵", "かし"), ("競売", "けいばい"), ("遺言", "いごん"), ("○", "まる"), ("×", "ばつ")]
SLOT_MARK = re.compile(r"\s*[［\[]\s*(?:№|No\.?|Ｎｏ．?)\s*[0-9０-９]+\s*[］\]]")
# 見本に入れたい語（読み間違えやすい語・法律用語）。見つかった肢を先に入れる
WANT = ["瑕疵", "競売", "遺言", "囲繞地", "催告", "善意", "抵当権", "勾留", "訴因", "既判力", "取締役会", "行政処分"]
SAMPLES = 10


def key() -> str:
    k = os.environ.get("GOOGLE_TTS_API_KEY") or ""
    f = ROOT / ".secrets" / "google-tts-key"
    if not k and f.exists():
        k = f.read_text(encoding="utf-8").strip()
    if not k:
        raise SystemExit("API キーがない：GOOGLE_TTS_API_KEY か .secrets/google-tts-key に置く")
    return k


def call(path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(f"{API}/{path}", data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", "X-Goog-Api-Key": key()})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def speech_text(t: str) -> str:
    # 古い年度の問題文は読点が「，」「．」。読み上げの区切りが分かるように「、」「。」にそろえる
    t = SLOT_MARK.sub("", t).strip().replace("，", "、").replace("．", "。")
    for a, b in READINGS:
        t = t.replace(a, b)
    return t


def pick_cards() -> list[dict]:
    """令和の年度から、科目がばらけるように10枚。読み間違えやすい語を含む肢を先に"""
    cards = []
    for f in sorted(DATA.glob("*-20[2-9]?-*.json"), reverse=True):
        d = json.loads(f.read_text(encoding="utf-8"))
        exp = {e["statement_id"]: e for e in d["explanations"]}
        for s in d["statements"]:
            if s.get("truth_at_exam") and not s.get("review_flag") and not s.get("requires_context") and s.get("sub") is None and s["id"] in exp:
                cards.append({"id": s["id"], "subject": d["subject"], "text": s["text"], "truth": s["truth_at_exam"]["value"],
                              "conclusion": exp[s["id"]]["conclusion"]})
    chosen: list[dict] = []
    for w in WANT:
        c = next((c for c in cards if w in c["text"] + c["conclusion"] and c not in chosen), None)
        if c and len(chosen) < SAMPLES:
            chosen.append(c)
    for subject in ["minpo", "shoho", "minso", "keiho", "keiso", "kenpo", "gyosei"]:
        if len(chosen) >= SAMPLES:
            break
        if not any(c["subject"] == subject for c in chosen):
            chosen.append(next(c for c in cards if c["subject"] == subject))
    return chosen[:SAMPLES]


def voices() -> list[str]:
    """日本語の声から、Neural2 と Chirp 3 HD を女性・男性1つずつ"""
    vs = call("voices?languageCode=ja-JP")["voices"]
    out = []
    for kind in ("Neural2", "Chirp3-HD"):
        for gender in ("FEMALE", "MALE"):
            v = next((v["name"] for v in sorted(vs, key=lambda v: v["name"]) if kind in v["name"] and v["ssmlGender"] == gender), None)
            if v:
                out.append(v)
    return out


def synth_one(text: str, voice: str, path: Path) -> None:
    r = call("text:synthesize", {"input": {"text": text}, "voice": {"languageCode": "ja-JP", "name": voice},
                                 "audioConfig": {"audioEncoding": "MP3"}})
    path.write_bytes(base64.b64decode(r["audioContent"]))


def split_long(text: str, limit: int = 45) -> list[str]:
    """読点で区切って、limit 字以下のかたまりにする（Chirp 3 HD は1文が長いと受け付けない）"""
    out, buf = [], ""
    for part in re.split(r"(?<=[、。，．])", text):
        if buf and len(buf) + len(part) > limit:
            out.append(buf)
            buf = ""
        buf += part
    out += [buf] if buf else []
    # 読点のない長いかたまりは、助詞の後で切る（それでも長ければ字数で）
    fixed = []
    for chunk in out:
        while len(chunk) > limit + 15:  # Chirp 3 HD は読点のない74字のかたまりも受け付けなかった（2026-10-25）
            cut = max((m.end() for m in re.finditer(r"[はがをにでと]", chunk[: limit + 15]) if m.end() >= limit // 2), default=limit)
            fixed.append(chunk[:cut])
            chunk = chunk[cut:]
        fixed.append(chunk)
    return fixed


def synth(text: str, voice: str, path: Path) -> None:
    """まず1回で読ませ、「文が長すぎる」と返されたら読点で区切って読ませ、つなぐ"""
    try:
        synth_one(text, voice, path)
        return
    except urllib.error.HTTPError as e:
        if e.code != 400 or "too long" not in e.read().decode():
            raise
    with tempfile.TemporaryDirectory() as tmp:
        parts = []
        for k, chunk in enumerate(split_long(text)):
            p = Path(tmp) / f"{k}.mp3"
            synth_one(chunk, voice, p)
            parts.append(p)
        lst = Path(tmp) / "list.txt"
        lst.write_text("".join(f"file '{p}'\n" for p in parts), encoding="utf-8")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(path)], check=True)


def join(q: Path, a: Path, out: Path, gap: float = 3.0) -> None:
    """肢 → 間 → 答え を1本にする（ffmpeg）"""
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(q), "-f", "lavfi", "-t", str(gap), "-i", "anullsrc=r=24000:cl=mono",
                    "-i", str(a), "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1", "-ac", "1", "-b:a", "48k", str(out)], check=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cards = pick_cards()
    vs = voices()
    print("声：", ", ".join(vs))
    chars = 0
    rows = []
    for v in vs:
        (OUT / v).mkdir(exist_ok=True)
        for n, c in enumerate(cards, 1):
            if (OUT / v / f"{n:02d}.mp3").exists():
                continue  # 作り済み
            q_text = speech_text(c["text"])
            a_text = speech_text(f"正解は、{'まる' if c['truth'] else 'ばつ'}。{c['conclusion']}")
            chars += len(q_text) + len(a_text)
            with tempfile.TemporaryDirectory() as tmp:
                q, a = Path(tmp) / "q.mp3", Path(tmp) / "a.mp3"
                synth(q_text, v, q)
                synth(a_text, v, a)
                join(q, a, OUT / v / f"{n:02d}.mp3")
            print(f"  {v} {n:02d} {c['id']}")
    for n, c in enumerate(cards, 1):
        cells = "".join(f'<td><audio controls preload="none" src="{html.escape(v)}/{n:02d}.mp3"></audio></td>' for v in vs)
        rows.append(f"<tr><td>{n}. {html.escape(c['id'])}<br><small>{html.escape(c['text'])}<br>→ {'○' if c['truth'] else '×'}　{html.escape(c['conclusion'])}</small></td>{cells}</tr>")
    head = "".join(f"<th>{html.escape(v)}</th>" for v in vs)
    (OUT / "index.html").write_text(
        f"<!doctype html><meta charset=utf-8><title>聞き流しの声の聞き比べ</title>"
        f"<style>body{{font-family:sans-serif;font-size:14px}}td{{vertical-align:top;border-bottom:1px solid #ddd;padding:6px}}audio{{width:220px}}</style>"
        f"<h1>聞き流しの声の聞き比べ</h1><p>肢 → 3秒の間 → 「正解は〜」と解説の結論。Google Cloud Text-to-Speech で作成（AI 音声）</p>"
        f"<table><tr><th>肢</th>{head}</tr>{''.join(rows)}</table>", encoding="utf-8")
    print(f"✅ {OUT.relative_to(ROOT)}/index.html（読んだ文字数 {chars}）")


if __name__ == "__main__":
    sys.exit(main())
