"""聞き流しのキャラクター（T063）の絵を、Gemini の画像モデル（Agent Platform・us-central1 の gemini-2.5-flash-image）で作る。

  python3 pipeline/char_image.py base                  # 見た目の候補を作る（audio/samples_char/base-*.png）
  python3 pipeline/char_image.py faces <見本の png>     # 見本と同じ人物で表情違いを作る（audio/samples_char/face-*.png）
  python3 pipeline/char_image.py gallery               # LOOKS の見た目ごとに、ふつうの絵と2頭身のちびキャラを作る（audio/samples_char/g/）

- キーは .secrets/google-vertex-key（声1と同じ）。請求は Google Cloud のクレジット
- 実在の人物・既存のキャラクターに似せない（指示に書く）
- 出力は audio/samples_char/（git では管理しない）。選んだ絵だけを app/public/ に置く
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

OUT = ROOT / "audio" / "samples_char"
MODEL = "gemini-2.5-flash-image"
# グローバルの口だとアジアの地域に振られて画像のモデルが見つからない（2026-10-27）。us-central1 に固定する
URL = ("https://us-central1-aiplatform.googleapis.com/v1/projects/344821173333/locations/us-central1/"
       f"publishers/google/models/{MODEL}:generateContent")

COMMON = ("Original anime-style character illustration for a study app, clean line art, soft pastel colors, "
          "plain very light background, no text, no watermark. Must be an original design, "
          "not resembling any existing anime character, VTuber, or real person.")
PERSONA = ("A cute, clever younger-sister type Japanese girl around 15 who is good at law, a little sleepy and sweet, "
           "slightly shy smile.")
BASES = [
    "soft short bob with a small star hair clip, big gentle eyes, oversized cream cardigan, holding a small pocket law book",
    "long hair in a low side ponytail tied with a ribbon, round glasses, navy school blazer, hugging a thick law book",
    "fluffy medium hair with a small ahoge, sleepy droopy eyes, hoodie with cat-ear hood down, holding a pen near her cheek",
    "twin low pigtails, bright eyes, sailor-style school uniform with a light blue scarf, a tiny scales-of-justice pin",
]
FACES = {
    "normal": "neutral friendly face, mouth slightly open as if talking",
    "think": "thinking face, finger on chin, eyes looking up",
    "happy": "very happy smile, eyes closed in joy, small sparkles",
    "sad": "a little disappointed but encouraging, soft frown with a small smile",
}


def generate(parts: list[dict], path: Path) -> None:
    body = {"contents": [{"role": "user", "parts": parts}], "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}
    for attempt in range(6):
        req = urllib.request.Request(URL, data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "x-goog-api-key": vertex_key()})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                res = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 5:
                time.sleep(10 * 2 ** attempt)  # 1分あたりの回数が少ない。混んでいたら待ってやり直す
                continue
            raise
    for p in res["candidates"][0]["content"]["parts"]:
        if "inlineData" in p:
            path.write_bytes(base64.b64decode(p["inlineData"]["data"]))
            return
    raise RuntimeError(f"絵が返ってこなかった：{res['candidates'][0].get('finishReason')}")


# 2026-10-27：見た目をたくさんの中から選ぶ（ユーザーのイメージは「ジト目の妹キャラ」。とらわれずに幅を出す）
LOOKS = [
    "half-closed sleepy jito-me eyes with a deadpan expression, messy light brown bob with an ahoge, oversized light blue hoodie, holding a pen",
    "jito-me (half-lidded, unimpressed) eyes, long straight black hair with blunt bangs, oversized grey cardigan over a school blouse, hugging a law book",
    "jito-me eyes and a tiny smug smile, silver-white short hair with a small side braid, black hoodie with a little bunny-ear hood, headphones around neck",
    "sleepy jito-me eyes, fluffy pink-brown twin tails tied low, pastel yellow sweater vest and shirt, holding a mug of cocoa and a pocket law book",
    "deadpan jito-me eyes, dark navy wolf-cut short hair, round black glasses, oversized white shirt with a loose ribbon tie",
    "half-lidded eyes with a bored pout, chestnut hair in a messy low ponytail, track jacket, chewing on the end of a pen",
    "jito-me eyes peeking over a book, mint-green tinted bob, cream knit beanie, cozy duffle coat",
    "calm jito-me eyes, long lavender hair with a hair clip shaped like scales of justice, sailor uniform with a big ribbon",
    "big sparkling round eyes and a cheerful grin, orange side ponytail, sporty parka, giving a peace sign",
    "gentle droopy eyes and a soft smile, long wavy honey-blond hair, frilly blouse and long skirt, holding an open law book",
    "sharp confident eyes, short black bob with a red hairpin, blazer uniform with an armband, pointing at an open law book",
    "shy upturned eyes behind large round glasses, brown braided pigtails, oversized cardigan sleeves covering her hands",
    "sleepy jito-me eyes, white hair with a black inner color, oversized black hoodie with cat-ear hood up, sitting cross-legged with a tablet",
    "jito-me eyes and puffed cheeks (sulking), short twin buns with long tails, light pink hoodie dress, holding a stack of sticky notes",
    "half-closed eyes and a faint smile, ash-blue long hair with a star hairclip, loose striped pajama-like hoodie, holding a pillow and a law book",
    "jito-me eyes, dark brown hair in a neat low bun with loose strands, oversized university-style cardigan, a pencil behind her ear",
]
CHIBI = ("Redraw the SAME character as a chibi / super-deformed figure, exactly 2 heads tall, full body standing, very big head and tiny "
         "simple body, same hair, eyes, outfit and colors, cute pose. Plain white background, no text, no letters on any object.")


def gallery() -> None:
    g = OUT / "g"
    g.mkdir(parents=True, exist_ok=True)
    for i, look in enumerate(LOOKS, 1):
        base = g / f"{i:02d}-base.png"
        if not base.exists():
            generate([{"text": f"{COMMON} Upper body, facing slightly to the side. {PERSONA} {look}. No letters on any object."}], base)
            print(f"  {base.name}", flush=True)
        chibi = g / f"{i:02d}-chibi.png"
        if not chibi.exists():
            img = {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(base.read_bytes()).decode()}}
            generate([img, {"text": CHIBI + " " + COMMON}], chibi)
            print(f"  {chibi.name}", flush=True)
        write_gallery(g)


def write_gallery(g: Path) -> None:
    rows = []
    for i, look in enumerate(LOOKS, 1):
        cells = "".join(f'<img src="{i:02d}-{k}.png" style="height:260px;border:1px solid #ddd;margin-right:6px">'
                        for k in ("base", "chibi") if (g / f"{i:02d}-{k}.png").exists())
        if cells:
            rows.append(f'<div style="margin:10px 0"><b>{i:02d}</b>　<span style="color:#666">{look}</span><br>{cells}</div>')
    (g / "index.html").write_text("<!doctype html><meta charset=utf-8><title>キャラクターの候補</title><body style='font-family:sans-serif'>"
                                  "<h1>見た目の候補（ふつうの絵＋2頭身のちびキャラ。AI 生成）</h1>" + "".join(rows), encoding="utf-8")


# 2026-10-27：ユーザーが 04・12・15 を気に入った（服が好き：ふわっとした部屋着・ニット・パステル）。残したうえで、ジト目版・混ぜた子・似た系統を作る
PERSONA2 = "A clever younger-sister type Japanese girl around 15 who is good at law, sleepy and a little sulky, cozy and sweet."
JITO = ("Change ONLY the eyes and expression: half-lidded sleepy jito-me eyes (upper eyelids lowered to cover the top of the irises), "
        "deadpan unimpressed face, small flat mouth, no smile. Keep everything else exactly the same.")
LOOKS2 = [
    ("keep", "04"), ("keep", "12"), ("keep", "15"),
    ("edit", "04", JITO), ("edit", "12", JITO), ("edit", "15", JITO),
    ("text", "brown braided pigtails and round glasses, loose pastel striped pajama-style hoodie (lavender, mint and cream stripes), holding a pillow and a small law book, half-lidded sleepy eyes"),
    ("text", "soft pink-brown wavy low twin tails, oversized beige knit cardigan with sleeves covering her hands, over a pastel yellow sweater vest and shirt, holding a mug of cocoa, sleepy jito-me eyes"),
    ("text", "long ash-blue hair with a small star hairclip, round glasses, mustard-yellow sweater vest over a white shirt, hugging a law book, deadpan half-lidded eyes"),
    ("text", "short fluffy cream-blonde bob, oversized lavender knit sweater falling off one shoulder slightly, holding a fluffy cushion and a pen, sleepy jito-me eyes"),
    ("text", "dark brown low pigtails tied with knit scrunchies, mint-green knitted cardigan over a striped pajama shirt, round glasses pushed up, holding a highlighter, deadpan eyes"),
    ("text", "light lilac hair in a loose side braid, cozy oatmeal-colored hooded knit poncho, holding a mug and a law book close, sleepy half-lidded eyes"),
    ("text", "chestnut medium hair with a small bear-ear hairclip, pastel blue fleece pajama set with a cardigan, hugging a pillow, jito-me eyes with a tiny pout"),
    ("text", "soft peach-colored long hair with a ribbon, cream cable-knit oversized sweater with sleeves covering hands, round glasses, holding sticky notes, sleepy deadpan eyes"),
]


def gallery2() -> None:
    g, src = OUT / "g2", OUT / "g"
    g.mkdir(parents=True, exist_ok=True)
    labels = []
    for i, item in enumerate(LOOKS2, 1):
        kind = item[0]
        base, chibi = g / f"{i:02d}-base.png", g / f"{i:02d}-chibi.png"
        if kind == "keep":
            label = f"元の {item[1]}（残す）"
            if not base.exists():
                base.write_bytes((src / f"{item[1]}-base.png").read_bytes())
                chibi.write_bytes((src / f"{item[1]}-chibi.png").read_bytes())
        elif kind == "edit":
            label = f"{item[1]} のジト目版"
            if not base.exists():
                ref = {"inlineData": {"mimeType": "image/png", "data": base64.b64encode((src / f"{item[1]}-base.png").read_bytes()).decode()}}
                generate([ref, {"text": item[2] + " " + COMMON}], base)
                print(f"  {base.name}", flush=True)
        else:
            label = item[1]
            if not base.exists():
                generate([{"text": f"{COMMON} Upper body, facing slightly to the side. {PERSONA2} {item[1]}. No letters on any object."}], base)
                print(f"  {base.name}", flush=True)
        if not chibi.exists():
            img = {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(base.read_bytes()).decode()}}
            generate([img, {"text": CHIBI + " Keep the same eyes and expression. " + COMMON}], chibi)
            print(f"  {chibi.name}", flush=True)
        labels.append(label)
        rows = []
        for k, lab in enumerate(labels, 1):
            cells = "".join(f'<img src="{k:02d}-{t}.png" style="height:260px;border:1px solid #ddd;margin-right:6px">' for t in ("base", "chibi"))
            rows.append(f'<div style="margin:10px 0"><b>{k:02d}</b>　<span style="color:#666">{lab}</span><br>{cells}</div>')
        (g / "index.html").write_text("<!doctype html><meta charset=utf-8><title>キャラクターの候補2</title><body style='font-family:sans-serif'>"
                                      "<h1>04・12・15 を元にした候補（AI 生成）</h1>" + "".join(rows), encoding="utf-8")


# 2026-10-27：ユーザーが g2 の 01（元の g の 04）に決めた。ジト目は表情の1つ（g2 の 04 をそのまま使う）。表情ひととおりを、ふつうの絵とちびキャラで作る
EXPRESSIONS = {
    "normal": "neutral friendly face, mouth slightly open as if talking",
    "smile": "gentle closed-mouth smile",
    "think": "thinking, one finger near her chin, eyes looking up and to the side",
    "happy": "very happy, bright open smile, eyes curved in joy, a few small sparkles around her",
    "sad": "a little disappointed but encouraging, soft frown with a small reassuring smile",
    "sleepy": "sleepy, eyes half closed, a small yawn with a hand near her mouth",
    "surprised": "surprised, eyes wide open, small open mouth",
    "smug": "proud and smug, slight smirk, eyes half-lidded with confidence",
}
SAME = ("Draw the SAME character as in the reference image: same face, hair (pink-brown wavy hair in low twin tails), same outfit "
        "(pastel yellow sweater vest over a white shirt), same mug and book, same colors and art style, same framing and size. "
        "Change ONLY the facial expression (and hands if needed) to: ")


def faces2() -> None:
    g, src = OUT / "g3", OUT / "g2"
    g.mkdir(parents=True, exist_ok=True)
    for kind, ref in (("base", src / "01-base.png"), ("chibi", src / "01-chibi.png")):
        (g / f"{kind}-jito.png").write_bytes((src / f"04-{kind}.png").read_bytes())
        img = {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(ref.read_bytes()).decode()}}
        for name, face in EXPRESSIONS.items():
            out = g / f"{kind}-{name}.png"
            if out.exists():
                continue
            extra = " Keep it a chibi / super-deformed figure, 2 heads tall, full body." if kind == "chibi" else ""
            generate([img, {"text": SAME + face + "." + extra + " " + COMMON}], out)
            print(f"  {out.name}", flush=True)
    names = list(EXPRESSIONS) + ["jito"]
    rows = "".join(f'<div style="display:inline-block;margin:8px;text-align:center"><img src="base-{n}.png" style="height:240px;border:1px solid #ddd"><br>'
                   f'<img src="chibi-{n}.png" style="height:160px;border:1px solid #ddd"><br>{n}</div>' for n in names)
    (g / "index.html").write_text("<!doctype html><meta charset=utf-8><title>表情</title><body style='font-family:sans-serif'>"
                                  "<h1>01 の表情（上：ふつうの絵、下：ちびキャラ。AI 生成）</h1>" + rows, encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    what = sys.argv[1] if len(sys.argv) > 1 else "base"
    if what == "base":
        for i, look in enumerate(BASES, 1):
            if (OUT / f"base-{i}.png").exists():
                continue
            text = f"{COMMON} Upper body, facing slightly to the side. {PERSONA} {look}."
            generate([{"text": text}], OUT / f"base-{i}.png")
            print(f"  base-{i}.png")
    elif what == "gallery":
        gallery()
    elif what == "gallery2":
        gallery2()
    elif what == "faces2":
        faces2()
    elif what == "faces":
        ref = Path(sys.argv[2])
        img = {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(ref.read_bytes()).decode()}}
        for name, face in FACES.items():
            text = (f"Draw the SAME character as in the reference image (same face, hair, outfit, colors and art style), "
                    f"upper body, same framing, with this expression: {face}. {COMMON}")
            generate([img, {"text": text}], OUT / f"face-{name}.png")
            print(f"  face-{name}.png")
    print(f"✅ {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
