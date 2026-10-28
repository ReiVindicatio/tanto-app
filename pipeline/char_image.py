"""聞き流しのキャラクター（T063）の絵を、Gemini の画像モデル（Agent Platform・us-central1 の gemini-2.5-flash-image）で作る。

  python3 pipeline/char_image.py base                  # 見た目の候補を作る（audio/samples_char/base-*.png）
  python3 pipeline/char_image.py faces <見本の png>     # 見本と同じ人物で表情違いを作る（audio/samples_char/face-*.png）
  python3 pipeline/char_image.py gallery               # LOOKS の見た目ごとに、ふつうの絵と2頭身のちびキャラを作る（audio/samples_char/g/）
  python3 pipeline/char_image.py themes                # 律の衣装と髪型のテーマの候補（T065。audio/samples_char/g6/）
  python3 pipeline/char_image.py theme_set <テーマ> <見本の png>   # 選んだ見本から、そのテーマの絵をひとそろい作る（audio/samples_char/themes/<テーマ>/）
  python3 pipeline/char_image.py sit_set <テーマ>      # 縁に腰かけるちびキャラ 8表情と、寝そべる絵（sit-smile.png と lie-sleepy.png の見本から）
  python3 pipeline/char_image.py motion_set <テーマ>   # 動きの絵：まばたき・足のバタバタ・寝そべりの足・寝転びかけ
  python3 pipeline/char_image.py backgrounds           # 律のページの背景（audio/samples_char/bg/）
  python3 pipeline/char_image.py extras_set <テーマ>   # 仕草（あくび・伸び・目をこする・ココア・衣装の動作・こっくり）・拍手・むくれ・口パク
                                                       # 背景を抜いて webp にするのは pipeline/char_cut.py

- キーは .secrets/google-vertex-key（声1と同じ）。請求は Google Cloud のクレジット
- 実在の人物・既存のキャラクターに似せない（指示に書く）
- 出力は audio/samples_char/（git では管理しない）。選んだ絵だけを app/public/ に置く
"""
from __future__ import annotations

import base64
import itertools
import json
import random
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from common import ROOT
from tts_gemini import vertex_key

OUT = ROOT / "audio" / "samples_char"
MODEL = "gemini-2.5-flash-image"
# グローバルの口だとアジアの地域に振られて画像のモデルが見つからない（2026-10-27）。地域を決めて呼ぶ。
# 1分あたりの回数の制限は地域ごとなので、使える地域を順に回して並べて作る（2026-10-27：us-central1 だけだと 429 が続いた）。
# アジアの地域（asia-northeast1）にはこのモデルがない
REGIONS = ["us-central1", "us-east4", "us-east5", "us-west1", "us-west4", "us-south1", "europe-west1", "europe-west4", "europe-north1"]
_next_region = itertools.count()
WORKERS = 3  # 並べて作る数（6 だと、地域ごととは別の全体の制限に当たって 429 が続いた：2026-10-27）


def url(region: str) -> str:
    return (f"https://{region}-aiplatform.googleapis.com/v1/projects/344821173333/locations/{region}/"
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


def generate(parts: list[dict], path: Path) -> int:
    """絵を1枚作る。返り値は 429 などで断られた回数（時間がどこにかかったかを見るため）"""
    body = {"contents": [{"role": "user", "parts": parts}], "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}
    refused = 0
    for attempt in range(60):
        region = REGIONS[next(_next_region) % len(REGIONS)]
        req = urllib.request.Request(url(region), data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "x-goog-api-key": vertex_key()})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                res = json.loads(r.read())
            if "parts" in res["candidates"][0].get("content", {}):
                break
            time.sleep(2)  # 絵のない応答がまれに返る。作り直す
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 59:
                refused += 1
                # 混んでいたら次の地域へ。地域をひと回りしたら少し待つ。
                # 2026-10-28：どの地域も同時に 429 を返すことが多い（地域ごとではなく、プロジェクト全体の制限）。そのときは待つしかない
                time.sleep(2 if (attempt + 1) % len(REGIONS) else min(180, 20 * (attempt // len(REGIONS) + 1)) + random.uniform(0, 5))
                continue
            raise
    else:
        raise RuntimeError("絵が返ってこなかった（何度やり直しても）")
    for p in res["candidates"][0]["content"]["parts"]:
        if "inlineData" in p:
            path.write_bytes(base64.b64decode(p["inlineData"]["data"]))
            return refused
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


# 2026-10-27：律の衣装と髪型（T065）。1枚絵なので付け替えはせず、衣装と髪型を組にした「テーマ」ごとに絵をそろえる
THEMES = {
    "knit": "oversized cream cable-knit sweater with long sleeves covering her hands, hair down in loose soft waves, holding a warm mug",
    "hoodie": "pastel lavender hoodie, hair in a messy high bun with a few loose strands, holding a highlighter pen",
    "pajama": "pastel mint pajamas with a small star pattern, hair in one loose side braid over her shoulder, hugging a pillow, sleepy cozy night mood",
    "summer": "light blue short-sleeve blouse with a small ribbon, a straw hat, hair in a high ponytail, holding a paper fan",
    "rain": "pastel yellow raincoat with the hood down, hair in two braids, holding a small clear umbrella",
    "yukata": "pastel pink yukata with a soft floral pattern, hair up in a bun with a small flower hair ornament, holding a round uchiwa fan",
    "blazer": "navy school blazer with a soft red ribbon, hair half-up with a small bow, holding a pocket law book",
    "library": "beige knit cardigan over a white blouse, round thin glasses, hair in a low side ponytail, hugging a stack of books",
    "winter": "camel duffle coat, fluffy white earmuffs and a pastel pink scarf, the same low twin tails, breath slightly visible",
    "autumn": "mustard cardigan and a brown beret, hair in two low buns, holding a fallen maple leaf",
    "christmas": "red and white knit sweater with a snowflake pattern, a small santa hat, the same low twin tails, holding a small wrapped present",
    "halloween": "cute little witch outfit with a short purple cape and a witch hat, the same low twin tails, holding a small pumpkin lantern",
    "spring": "light pink cardigan over a white dress, a cherry-blossom hair clip, hair down and straight, a few cherry petals",
    "jersey": "pastel mint track jacket zipped up, hair in a high ponytail, holding a water bottle",
    "exam": "neat white blouse with a navy cardigan, hair in a neat low ponytail, holding a pencil case and a clear file folder, determined gentle smile",
}
THEME = ("Draw the SAME character as in the reference image: same face, same eye shape and eye color, same pink-brown hair color, "
         "same age and body, same art style and colors, same framing (upper body, same size and position). "
         "Change ONLY the outfit, hairstyle and props to: ")


def themes() -> None:
    g = OUT / "g6"
    g.mkdir(parents=True, exist_ok=True)
    ref = OUT / "g3" / "base-smile.png"
    img = {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(ref.read_bytes()).decode()}}
    for name, look in THEMES.items():
        for k in (1, 2):
            out = g / f"{name}-{k}.png"
            if out.exists():
                continue
            generate([img, {"text": THEME + look + ". Gentle closed-mouth smile. " + COMMON}], out)
            print(f"  {out.name}", flush=True)
    rows = "".join(f'<div style="display:inline-block;margin:8px;text-align:center"><img src="{n}-1.png" style="height:300px;border:1px solid #ddd">'
                   f'<img src="{n}-2.png" style="height:300px;border:1px solid #ddd"><br>{n}</div>' for n in THEMES)
    (g / "index.html").write_text("<!doctype html><meta charset=utf-8><title>律のテーマ</title><body style='font-family:sans-serif'>"
                                  "<h1>律の衣装と髪型のテーマの候補（AI 生成）</h1>" + rows, encoding="utf-8")


# テーマのひとそろい（T065）：ふつうの絵 9表情・ちびキャラ 9表情・のぞく絵 8表情
THEME_FACES = {**EXPRESSIONS, "jito": "jito-me: half-lidded eyes (upper eyelids lowered over the top of the irises), deadpan unimpressed face, small flat mouth, no smile"}
SAME_THEME = ("Draw the SAME character as in the reference image: same face, same hairstyle, same outfit and props, same colors and art style, "
              "same framing and size. Change ONLY the facial expression (and hands if needed) to: ")
PEEK = ("Image 1 shows the pose: a chibi girl PEEKING over a flat grey ledge at the bottom, both forearms resting on top of the ledge, "
        "only head, shoulders and arms above it, plain white background above, plain light grey band below. Image 2 shows the character. "
        "Draw the character of image 2 (same chibi style, same hairstyle, same outfit and colors; leave out handheld props) in exactly the pose, "
        "framing and ledge of image 1. Expression: ")


def run_all(jobs: list[tuple[list[dict], Path]]) -> None:
    """まだない絵を並べて作る（地域を回すので速い）。jobs は (parts, 出力先)"""
    todo = [(parts, out) for parts, out in jobs if not out.exists()]

    def one(job: tuple[list[dict], Path]) -> str:
        t = time.time()
        refused = generate(*job)
        return f"{job[1].name}  {time.time() - t:.0f}秒" + (f"（断られた {refused} 回）" if refused else "")

    start = time.time()
    with ThreadPoolExecutor(WORKERS) as ex:
        for line in ex.map(one, todo):
            print(f"  {line}", flush=True)
    if todo:
        print(f"  → {len(todo)} 枚 {time.time() - start:.0f}秒", flush=True)


def _img(path: Path) -> dict:
    return {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(path.read_bytes()).decode()}}


def theme_set(name: str, src: Path) -> None:
    g = OUT / "themes" / name
    g.mkdir(parents=True, exist_ok=True)
    base = g / "base-smile.png"
    if not base.exists():
        base.write_bytes(src.read_bytes())
    master = g / "chibi-smile.png"
    run_all([([_img(base), {"text": SAME_THEME + t + ". " + COMMON}], g / f"base-{f}.png") for f, t in THEME_FACES.items()]
            + [([_img(base), {"text": CHIBI + " The hairstyle must be clearly visible. Gentle closed-mouth smile. " + COMMON}], master)])
    run_all([([_img(master), {"text": SAME_THEME + t + ". Keep it a chibi / super-deformed figure, 2 heads tall, full body. " + COMMON}],
              g / f"chibi-{f}.png") for f, t in THEME_FACES.items()])
    if "--peek" in sys.argv:  # のぞく絵（T063）は今は使わない（腰かける絵に替えた）
        pose = OUT / "g5" / "peek-happy.png"
        run_all([([_img(pose), _img(g / f"chibi-{f}.png"), {"text": PEEK + t + ". No text. " + COMMON}], g / f"peek-{f}.png")
                 for f, t in THEME_FACES.items() if f != "surprised"])


# 縁に腰かける（T065）：ちびキャラが○×の欄・タブ・結果の欄の縁に腰かけ、足をぶら下げる。のぞく絵より服がよく見える
SIT = ("Image 1 shows the pose: a chibi girl SITTING on the edge of a flat ledge (thin dark top line, plain light grey band below), "
       "both legs dangling down in front of the grey band, hands on the ledge beside her, plain white background above. "
       "Image 2 shows the character with the target expression. Draw the character of image 2 (same chibi style, same face, hairstyle, "
       "outfit and colors; leave out handheld props) in exactly the pose, framing, size and ledge of image 1. Expression: ")
LIE = ("Image 1 shows the pose: a chibi girl LYING on her stomach on top of a flat ledge, reading a small book, legs bent up behind her. "
       "Image 2 shows the character. Draw the character of image 2 (same chibi style, face, hairstyle, outfit and colors) in exactly the pose, "
       "framing, size and ledge of image 1, sleepy relaxed face. ")


def outfit(g: Path) -> str:
    """テーマの衣装の説明（themes/<テーマ>/outfit.txt。docs/ritsu-costumes.md の設計書から書く）。
    姿勢の見本（いつもの服）に引っぱられて、髪型や服の色が変わるのを防ぐ（2026-10-27：ニットでツインテール・黄色いベストに戻った）"""
    f = g / "outfit.txt"
    return (" IMPORTANT – the outfit and hairstyle must be exactly this, taken from the character image, NOT from the pose image: "
            + f.read_text(encoding="utf-8").strip() + " ") if f.exists() else ""


# 最初の1枚（腰かける・寝そべる）は、姿勢の見本の絵を渡さず、そのテーマのちびキャラと文章だけで作る。
# いつもの服の絵を見本に渡すと、髪型（ツインテール）や服の色がそちらに引っぱられた（2026-10-27 ニット）
LEDGE = ("Draw the SAME chibi character as in the reference image (same 2-heads-tall chibi style, same face, same hairstyle, same outfit and colors, "
         "same art style; leave out handheld props unless stated). There is a flat horizontal ledge across the full width at the bottom of the image: "
         "a thin dark top line with a plain light grey band below it. Plain white background above the ledge, no text. The whole outfit must be clearly visible. ")
# 手足の数（2026-10-28：パーカーで、寝そべる絵と寝転びかけの絵の足が3本に描かれた。足を描き直させる指示で、元の足を残したまま新しい足を足しやすい）。
# 全身の絵の指示にはすべて付ける
LIMBS = (" ANATOMY CHECK: she has exactly TWO legs and TWO arms in total – count them. Never draw a third leg, a third arm, or duplicated feet "
         "or hands. When legs or arms are moved, the old ones are REPLACED, not kept. ")
SIT_FIRST = "She SITS on the edge of the ledge with both legs dangling down in front of the grey band, hands on the ledge beside her, gentle closed-mouth smile. " + LIMBS
LIE_FIRST = ("She LIES on her stomach on top of the ledge, reading a small plain book (no letters) propped in front of her, legs bent up behind her and "
             "crossed at the ankles, relaxed sleepy face with closed eyes; her whole body is above the ledge line. " + LIMBS)


def sit_set(name: str) -> None:
    g = OUT / "themes" / name
    pose, lie = g / "sit-smile.png", g / "lie-sleepy.png"
    run_all([([_img(g / "chibi-smile.png"), {"text": LEDGE + SIT_FIRST + outfit(g) + COMMON}], pose),
             ([_img(g / "chibi-smile.png"), {"text": LEDGE + LIE_FIRST + outfit(g) + COMMON}], lie)])
    run_all([([_img(pose), _img(g / f"chibi-{f}.png"), {"text": SIT + t + "." + LIMBS + outfit(g) + "No text. " + COMMON}], g / f"sit-{f}.png")
             for f, t in THEME_FACES.items() if f != "surprised"])


# 動き（T065）：細かい動き（足のバタバタ）は絵を切り分けて動かす。絵を足すのは、まばたき・跳ねる・座る→寝そべるの間だけ
BLINK_FACES = ["normal", "smile", "think", "sad", "smug", "jito"]
BLINK = ("Redraw the reference image EXACTLY (same pose, same size and position, same outfit, same colors, same ledge), "
         "changing ONLY the eyes: both eyes gently closed as in a blink (curved closed eyelids). Everything else must stay identical. ")
HOP = ("Image 1 shows the character sitting on the edge of a ledge. Draw the SAME character (same chibi style, face, hair, outfit and colors) "
       "hopping up a little from the ledge: the whole body just above the ledge line, both arms raised happily, legs together and slightly bent, "
       "the same ledge (thin dark line, light grey band) at the bottom, plain white background. IMPORTANT: keep her EXACTLY the same size as in "
       "image 1 (same head size, same position left-right); do not shrink her; the hop is small. Expression: ")
# 2026-10-27：最初の指示では、座る絵より小さく（頭が75%ほど）描いた。大きさを強く指示した
MID = ("Image 1 shows the character sitting on the edge of a ledge, image 2 shows the same character lying on her stomach on top of the ledge reading. "
       "Draw the in-between moment: she is leaning forward and lowering herself onto the ledge, both hands and knees on top of the ledge, "
       "about to lie down, holding the small book in one hand. Same chibi style, face, hair, outfit, colors and size, the same ledge, plain white background. "
       "Do not keep the dangling legs of image 1: both legs are now kneeling on the ledge. ")  # 2026-10-28 座った足を残したまま膝の足を足した（足3本）


KICK = ("Redraw the reference image EXACTLY (same pose, same size and position, same face, hair, outfit, colors, book and ledge), "
        "changing ONLY her lower legs and feet that are raised behind her: ")
KICKS = {1: "the lower legs swung further back and lower, feet pointing back, legs slightly apart",
         2: "the lower legs swung further forward and higher, nearly upright, ankles crossed the other way"}


# 座って足をバタバタ（2026-10-27）：足を縦に縮めるだけだと「伸び縮み」に見えた（ユーザー）。足を前に振り上げた・後ろに引いたコマを作り、
# 足のまわりだけ貼って切り替える。コマは表情ごとに要るので、バタバタする場面の表情（読み上げ中＝ふつう・考え中・ホームのにっこり）だけ
SWING_FACES = ["normal", "think", "smile"]
SWING = ("Redraw the reference image EXACTLY (same pose, same size and position, same face, hair, outfit, colors and ledge), "
         "changing ONLY her lower legs and feet that dangle below the ledge: ")
SWINGS = {1: "both lower legs swung forward and up, knees bent, the soles of the shoes tilted toward the viewer, feet a little apart",
          2: "the left lower leg swung forward and up, the right lower leg swung back under the ledge, like kicking her feet alternately"}


def motion_set(name: str) -> None:
    g = OUT / "themes" / name
    jobs = [([_img(g / "lie-sleepy.png"), {"text": KICK + t + ". Everything else must stay identical." + LIMBS + outfit(g) + "No text. " + COMMON}],
             g / f"lie-kick-{k}.png") for k, t in KICKS.items()]
    jobs += [([_img(g / f"sit-{f}.png"), {"text": BLINK + outfit(g) + "No text. " + COMMON}], g / f"blink-{f}.png") for f in BLINK_FACES]
    jobs += [([_img(g / f"sit-{f}.png"), {"text": SWING + t + ". Everything else must stay identical." + LIMBS + outfit(g) + "No text. " + COMMON}],
              g / f"swing-{f}-{k}.png") for f in SWING_FACES for k, t in SWINGS.items()]
    jobs += [([_img(g / "sit-smile.png"), _img(g / "lie-sleepy.png"), {"text": MID + LIMBS + outfit(g) + "No text. " + COMMON}], g / f"mid-lie-{k}.png")
             for k in (1, 2)]
    if "--hop" in sys.argv:  # 跳ねたところの絵は大きさがそろわず使っていない（2026-10-27）
        jobs += [([_img(g / f"sit-{f}.png"), {"text": HOP + THEME_FACES[f] + ". No text. " + COMMON}], g / f"hop-{f}.png") for f in ("happy", "smug")]
    run_all(jobs)


# 仕草・口パク・拍手など（T065：「もっと動いてほしい」ユーザー）。どれも元の絵の一部だけを描き直したコマ
KEEP = (" Everything else must stay identical: same pose of the legs, same size and position, same face shape, hair, outfit, colors and ledge. "
        "No text. " + LIMBS)
GESTURES = {  # 腰かける絵（にっこり）から。待っている間にときどき出す
    "yawn": "a big yawn: mouth wide open, eyes closed, one hand covering her mouth",
    "stretch": "stretching both arms straight up above her head, eyes closed, relaxed and comfortable",
    "rub": "sleepily rubbing one eye with the back of her hand, the other hand on the ledge",
    "sip": "holding a mug of cocoa in both hands and sipping from it, eyes closed happily",
}
EXTRAS = {  # (元の絵, 指示)
    "nod": ("sit-normal", "dozing off: her head drooping forward and a little to the side, eyes closed, very sleepy"),
    "clap": ("sit-happy", "clapping her hands together in front of her chest, very happy, eyes curved in joy"),
    "pout": ("sit-jito", "sulking with puffed-out cheeks, half-lidded jito eyes, a little pouty"),
}
TALK = ("Redraw the reference image EXACTLY, changing ONLY the mouth: the mouth CLEARLY OPEN as if saying 'ah' in the middle of speaking "
        "(an obviously open mouth, larger than in the reference). Everything else must stay pixel-identical: same face, eyes, hair, outfit, pose and position. No text. ")
# 2026-10-27：「小さく自然に開けた口」の指示では、口がほとんど変わらない絵が多かった（口パクが見えない）。はっきり開ける指示に
TALK_SIT = ["normal", "smile", "happy", "sad", "think"]


def extras_set(name: str) -> None:
    g = OUT / "themes" / name
    sig = g / "signature.txt"  # 衣装ごとの特有の動作（docs/ritsu-costumes.md の設計書から）
    jobs = [([_img(g / "sit-smile.png"), {"text": "Redraw the reference image, changing her arms, hands and expression to: " + t + "." + KEEP + outfit(g) + COMMON}],
             g / f"gesture-{n}.png") for n, t in GESTURES.items()]
    if sig.exists():
        jobs.append(([_img(g / "sit-smile.png"), {"text": "Redraw the reference image, changing her arms, hands and expression to: "
                      + sig.read_text(encoding="utf-8").strip() + "." + KEEP + outfit(g) + COMMON}], g / "gesture-signature.png"))
    jobs += [([_img(g / f"{src}.png"), {"text": "Redraw the reference image, changing her pose of the upper body and expression to: " + t + "." + KEEP
               + outfit(g) + COMMON}], g / f"gesture-{n}.png") for n, (src, t) in EXTRAS.items()]
    jobs += [([_img(g / f"sit-{f}.png"), {"text": TALK + outfit(g) + COMMON}], g / f"talk-sit-{f}.png") for f in TALK_SIT]
    jobs += [([_img(g / f"base-{f}.png"), {"text": TALK + outfit(g) + COMMON}], g / f"talk-base-{f}.png") for f in THEME_FACES]
    run_all(jobs)


# 律のページの背景（T065）：律が目立つよう、淡くやわらかい背景。人物は描かない
BACKGROUNDS = {
    "room": "a cozy girl's study room in the daytime: a wooden desk with a small stack of books and a mug, a bookshelf, soft curtains, a potted plant",
    "window": "a sunny window seat on an early-winter afternoon: cushions, a knitted blanket, warm sunlight, a tree with the last autumn leaves outside",
    "library": "a quiet old library: tall wooden bookshelves, a reading table with a lamp, soft light through tall windows",
    "night": "a desk at night: a warm desk lamp, an open notebook and pens, a window with a starry night sky, a sleepy cozy mood",
    "studyhall": "a calm self-study room: rows of wooden desks, large windows, soft morning light, a clock on the wall",
    "sakura": "a path lined with cherry blossom trees in spring, petals falling, soft blue sky",
    "engawa": "a Japanese house veranda (engawa) in summer: a wind chime, a glass of barley tea, green garden, blue sky with clouds",
    "snow": "a window with snow falling outside at dusk: frosty glass, a warm room with fairy lights, a cup of cocoa on the sill",
}
BG = ("A background illustration only, with NO people and NO characters. Soft pastel anime background art, gentle light, slightly blurred and low "
      "contrast so that a character placed in front stands out, no text, no letters, wide 4:3 composition. Scene: ")


def backgrounds() -> None:
    g = OUT / "bg"
    g.mkdir(parents=True, exist_ok=True)
    run_all([([{"text": BG + t + "."}], g / f"{n}.png") for n, t in BACKGROUNDS.items()])


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
    elif what == "themes":
        themes()
    elif what == "extras_set":
        extras_set(sys.argv[2])
    elif what == "backgrounds":
        backgrounds()
    elif what == "motion_set":
        motion_set(sys.argv[2])
    elif what == "sit_set":
        sit_set(sys.argv[2])
    elif what == "theme_set":
        theme_set(sys.argv[2], Path(sys.argv[3]))
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
