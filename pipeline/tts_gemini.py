"""聞き流しの「声2」（T061）：Agent Platform（Vertex）の Gemini の音声合成で、読み方を言葉で指示して1本作る。

- キーは .secrets/google-vertex-key（サービスアカウントにひも付けたキー。Agent Platform API だけに絞ったもの）。請求は Google Cloud（トライアルのクレジット）
- 読み方の指示は「台本の形」（声の設定・演出のメモ・読ませる文を見出しで分ける）で渡す。日本語や英語の指示を文の前に置くと、
  指示の文まで読み上げた（2026-10-26。台本の形なら、指示なしと長さがほぼ同じ）
- 実在の特定の人物の声には似せない（一般的な声の性格として指示する）
"""
from __future__ import annotations

import base64
import json
import re
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from common import ROOT
from tts_sample import split_long

MODEL = "gemini-3.8-flash-tts"  # Agent Platform（Vertex）で使える Gemini の音声合成（2026-10-26）


def script(style: str, profile: str = "A young, intelligent and cute Japanese anime heroine.", scene: str = "") -> str:
    return (f"# AUDIO PROFILE\n{profile}\n" + (f"## THE SCENE\n{scene}\n" if scene else "")
            + f"## DIRECTOR'S NOTES\nStyle: {style}\n"
            "Only speak the transcript below. Do not read these notes.\n## TRANSCRIPT\n")


# 2026-10-26：見本を聞き比べて、Leda ＋「舌足らず」の指示に決めた（見本の 9 番）
TONGUE = ("A sweet, slightly babyish-sounding Japanese anime girl with a tongue-tied way of speaking (shita-tarazu): "
          "consonants soft and rounded, 's' sounds slightly lisped, words gently running together; high, airy, sugary voice.")
TONGUE_STYLE = ("soft and close to the mic, a little sleepy and clingy; drawn-out vowels at the end of phrases; "
                "cute but still understandable, legal terms recognizable; slow, relaxed pace; never loud.")
LEDA_VOICE = "Leda"
LEDA_PROMPT = script(TONGUE_STYLE, TONGUE)

# 使ったトークンの合計（費用の見積もり用。usageMetadata をそのまま足す）
usage: dict[str, int] = {}
_usage_lock = threading.Lock()


def vertex_key() -> str:
    f = ROOT / ".secrets" / "google-vertex-key"
    if not f.exists():
        raise SystemExit("API キーがない：.secrets/google-vertex-key に置く（サービスアカウントにひも付けたキー。Vertex AI ユーザーの役割）")
    return f.read_text(encoding="utf-8").strip()


def synth_one(text: str, voice: str, prompt: str, path: Path) -> None:
    """返ってくるのは WAV か PCM（audio/l16）なので、ffmpeg で mp3 にする"""
    body = {"contents": [{"role": "user", "parts": [{"text": f"{prompt}{text}"}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    url = f"https://aiplatform.googleapis.com/v1/publishers/google/models/{MODEL}:generateContent"
    for attempt in range(5):
        req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "x-goog-api-key": vertex_key()})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                res = json.loads(r.read())
            if "parts" in res["candidates"][0].get("content", {}):
                break
            # 音声が入っていない応答が、まれに返る（2026-10-26：200本で1本）。作り直す
            if attempt == 4:
                raise RuntimeError(f"音声のない応答：{res['candidates'][0].get('finishReason')}")
            time.sleep(2)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 4:
                time.sleep(5 * 2 ** attempt)
                continue
            raise
    with _usage_lock:
        for k, v in res.get("usageMetadata", {}).items():
            if isinstance(v, int):
                usage[k] = usage.get(k, 0) + v
    part = res["candidates"][0]["content"]["parts"][0]["inlineData"]
    mime = part.get("mimeType", "")
    with tempfile.NamedTemporaryFile(suffix=".wav" if "wav" in mime else ".pcm") as f:
        f.write(base64.b64decode(part["data"]))
        f.flush()
        if "wav" in mime:
            src = ["-i", f.name]
        else:
            rate = re.search(r"rate=(\d+)", mime)
            src = ["-f", "s16le", "-ar", rate.group(1) if rate else "24000", "-ac", "1", "-i", f.name]
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *src, "-ac", "1", "-b:a", "48k", str(path)], check=True)


def synth(text: str, voice: str, prompt: str, path: Path) -> None:
    """まず1回で読ませ、400 が返されたら読点で区切って読ませ、つなぐ"""
    try:
        synth_one(text, voice, prompt, path)
        return
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise
    with tempfile.TemporaryDirectory() as tmp:
        parts = []
        for k, chunk in enumerate(split_long(text)):
            p = Path(tmp) / f"{k}.mp3"
            synth_one(chunk, voice, prompt, p)
            parts.append(p)
        lst = Path(tmp) / "list.txt"
        lst.write_text("".join(f"file '{p}'\n" for p in parts), encoding="utf-8")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(path)], check=True)
