"""律のセリフの声（T065）：app/src/ritsu/lines.json のセリフを、声1（Gemini・Leda・舌足らず）で1本ずつ作る。

  python3 pipeline/ritsu_voice.py            # まだない声だけ作る（app/public/voices/ritsu/<id>.mp3）
  python3 pipeline/ritsu_voice.py --redo ID  # 指定したセリフを作り直す

- 表情に合わせて、読み方の指示（演出のメモ）を少し変える
- 同じ言葉をくり返して長くなることがある（声1で起きた）。文字数に比べて長すぎたら作り直す
- 数が入るセリフ（"voice": false）は作らない
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from common import ROOT
from tts_gemini import LEDA_VOICE, TONGUE, TONGUE_STYLE, script, synth_one, usage

LINES = ROOT / "app" / "src" / "ritsu" / "lines.json"
OUT = ROOT / "app" / "public" / "voices" / "ritsu"

MOOD = {
    "normal": "",
    "smile": " Gentle and warm, smiling while speaking.",
    "think": " Thoughtful and a little hesitant, as if thinking out loud.",
    "happy": " Happy and bright, a little excited.",
    "sad": " A little sad and soft, but kind.",
    "sleepy": " Very sleepy and drowsy, almost yawning.",
    "surprised": " Surprised, a little higher pitch.",
    "smug": " Proud and a little smug, playful.",
    "jito": " Deadpan and a little sulky, flat tone.",
}


def spoken(text: str) -> str:
    """記号を読みやすくする（○×は「まる」「ばつ」）"""
    return text.replace("○", "まる").replace("×", "ばつ").replace("…", "、")


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip() or 0)


def make(line: dict) -> str:
    out = OUT / f"{line['id']}.mp3"
    prompt = script(TONGUE_STYLE + MOOD.get(line["face"], ""), TONGUE)
    text = spoken(line["text"])
    limit = 2.5 + 0.35 * len(text)  # これより長ければ、くり返したとみて作り直す
    for attempt in range(4):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "a.mp3"
            synth_one(text, LEDA_VOICE, prompt, p)
            d = duration(p)
            if d <= limit or attempt == 3:
                out.write_bytes(p.read_bytes())
                return f"{line['id']} {d:.1f}s" + ("（長いまま）" if d > limit else "")
    return line["id"]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    lines = [l for l in json.loads(LINES.read_text(encoding="utf-8")) if l.get("voice") is not False]
    if "--redo" in sys.argv:
        ids = set(sys.argv[sys.argv.index("--redo") + 1:])
        todo = [l for l in lines if l["id"] in ids]
    else:
        todo = [l for l in lines if not (OUT / f"{l['id']}.mp3").exists()]
    print(f"{len(todo)} 本を作る（全 {len(lines)} 本）", flush=True)
    with ThreadPoolExecutor(4) as ex:
        for msg in ex.map(make, todo):
            print(" ", msg, flush=True)
    print(f"✅ {OUT.relative_to(ROOT)}　トークン {usage}")


if __name__ == "__main__":
    main()
