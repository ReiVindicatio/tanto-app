"""聞き流しの「声2」の見本：Gemini の音声合成（Agent Platform（Vertex）の Gemini の音声合成。キーは .secrets/google-vertex-key＝サービスアカウントにひも付けたキー）で、読み方を言葉で指示して作る。

  python3 pipeline/tts_gemini_sample.py

- 見本は tts_sample.py の10肢のうち1肢。声と読み方の指示の組み合わせごとに、肢 → 3秒の間 → 答えと結論 を1本にする
- 本番の生成は tts.py --voice gemini-leda（合成の処理は tts_gemini.py）
- 出力は audio/samples_gemini/（git では管理しない）。今の声（Chirp 3 HD・Achernar）の見本も並べた index.html を作る
- 実在の特定の声優の声に似せる指示はしない（「声優のような演技」まで）
"""
from __future__ import annotations

import html
import subprocess
import sys
import tempfile
from pathlib import Path

from common import ROOT
from tts_gemini import MODEL, TONGUE, TONGUE_STYLE, script, synth
from tts_sample import join, pick_cards, speech_text

OUT = ROOT / "audio" / "samples_gemini"



YOUNG = "A youthful, high-school-age Japanese anime girl: smart, cute and a little shy, with a light, clear, higher-pitched voice."
WHISPER = "ASMR-like soft whisper right next to the listener's ear, breathy, sweet and clever; every word still clearly audible; slow pace with small pauses."
# 妹っぽく：聞き手との関係と気持ちの動きを先に書く（形容詞を重ねるより効く、という指南を参考に。2026-10-26）
SISTER = "A clever younger sister, about 15, who is better at law than her older sibling and secretly proud of it; affectionate, a little teasing, light and higher-pitched voice."
SISTER_SCENE = "Late at night in a quiet room. She leans close to her older sibling, who is studying for the bar exam, and quietly helps with a practice question so as not to wake the family."
VTUBER = "A cute, smart Japanese virtual streamer girl (VTuber-style character, not any real person): bright, expressive, friendly, higher-pitched anime voice."
VTUBER_SCENE = "A cozy late-night study stream with a small audience. She talks softly into a close microphone, explaining a past exam question to her viewers like a friend."
# 2026-10-26：9 が最良。声色は声ごとに固定で、指示では変わらない → 9 の指示のまま、まだ試していない女性の声を全部試す
COMBOS = [("Leda", script(TONGUE_STYLE, TONGUE), "9 Leda・舌足らず")] + [
    (v, script(TONGUE_STYLE, TONGUE), f"{13 + i} {v}・舌足らず")
    for i, v in enumerate(["Zephyr", "Kore", "Aoede", "Callirrhoe", "Autonoe", "Despina", "Erinome",
                           "Gacrux", "Pulcherrima", "Vindemiatrix", "Sulafat"])
]
SAMPLE_CARD = 2  # 見本にする肢（pick_cards の3番目：遺言の肢）。1肢だけ作る


def duration(p: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    c = pick_cards()[SAMPLE_CARD]
    secs = 0.0
    for voice, prompt, label in COMBOS:
        out = OUT / f"{label}.mp3"
        if out.exists():
            continue
        with tempfile.TemporaryDirectory() as tmp:
            q, a = Path(tmp) / "q.mp3", Path(tmp) / "a.mp3"
            synth(speech_text(c["text"]), voice, prompt, q)
            synth(speech_text(f"正解は、{'まる' if c['truth'] else 'ばつ'}。{c['conclusion']}"), voice, prompt, a)
            secs += duration(q) + duration(a)
            join(q, a, out)
        print(f"  {label}", flush=True)
    now = f"../samples/ja-JP-Chirp3-HD-Achernar/{SAMPLE_CARD + 1:02d}.mp3"
    rows = [f'<tr><td>今の声（Chirp 3 HD・Achernar）</td><td><audio controls preload="none" src="{now}"></audio></td></tr>']
    rows += [f'<tr><td>{html.escape(label)}</td><td><audio controls preload="none" src="{html.escape(label)}.mp3"></audio></td></tr>' for _, _, label in COMBOS]
    (OUT / "index.html").write_text(
        "<!doctype html><meta charset=utf-8><title>聞き流しの声2の聞き比べ</title>"
        "<style>body{font-family:sans-serif;font-size:15px}td{padding:8px;border-bottom:1px solid #ddd}audio{width:280px}</style>"
        f"<h1>聞き流しの声2の聞き比べ（知的で可愛い・ささやき気味）</h1><p>肢：{html.escape(c['text'])}</p>"
        f"<p>Gemini の音声合成（{MODEL}）に演出を指示して作成（AI 音声）</p><table>{''.join(rows)}</table>", encoding="utf-8")
    print(f"✅ {OUT.relative_to(ROOT)}/index.html（作った音声の長さ {secs / 60:.1f}分）")


if __name__ == "__main__":
    sys.exit(main())
