"""星詠みの「風を受ける座り絵」と全画面の技の絵を、配信の形にする（2026-11-02。絵はユーザーが試作で選んだもの）。

  CHAR_PY の python で：python pipeline/ritsu_wind.py faces hoshiyomi  # 表情と口パクの絵（顔だけ差し替えるのでマントは動かない）。themes/<ID>/proto/ へ
                        python pipeline/ritsu_wind.py hoshiyomi        # themes/<ID>/proto/ → special/<ID>/（wind-*.webp・cutin.webp・keypose.webp と動かす範囲の地図）
  そのあと python3 pipeline/ritsu_special_finish.py upload <ID>

- 緑の背景で描いた絵を、背景の色の強さで抜く
- 地図（wind-map.png など）の赤がマント、緑が髪の動く量。顔と胴体は 0
"""
from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

import char_cut as cc
from common import ROOT
from ritsu_sit_plate import key

SPECIAL = ROOT / "audio" / "samples_char" / "special"
PAD = 40
SETS = {"hoshiyomi": {"wind": dict(neck=(269, 525), head=(269, 320), headr=170, reach=730, right=190, file="sit-wind-smile.png"),
                      "keypose": dict(neck=(537, 285), head=(537, 180), headr=85, reach=560, right=0, file="key-pose.png")}}
# 口パクは、声が流れる表情（5つ）だけ
TALK = "normal smile think happy sad".split()
FACES = "normal think happy sad sleepy surprised smug jito blink".split() + [f"{f}-talk" for f in TALK]
FACE_BOX = (100 / 1024, 250 / 1024, 445 / 1024, 515 / 1024)
EXPRESSION = {"normal": "a neutral relaxed expression with a small open mouth, as if about to speak", "think": "a thoughtful expression, eyes looking slightly upward, mouth small",
              "happy": "a very happy expression, eyes closed in joyful arcs, wide open smiling mouth", "sad": "a little sad expression, eyebrows lowered, small frown",
              "sleepy": "a very sleepy expression, eyes half closed, small mouth", "surprised": "a surprised expression, eyes wide open, small round open mouth",
              "smug": "a proud smug expression, eyes half closed, one corner of the mouth up",
              "jito": "a deadpan sulky stare: the upper eyelids lowered straight across, covering the top third of her eyes, with her brown irises and dark pupils still clearly visible and looking at the viewer, and a small straight mouth",
              "blink": "the same gentle smile but both eyes closed in a blink"}
TALKING = "the same eyes and eyebrows as in the reference, but her mouth is open in the middle of speaking a word, a small soft open mouth with the tongue barely visible"


def crop_box(im: Image.Image, pad: int) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = im.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
    return max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)


def weight(im: Image.Image, box: tuple, neck: tuple, head: tuple, headr: int, reach: int, right: int) -> Image.Image:
    a = np.asarray(im).astype(float)
    h, w, _ = a.shape
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    lum = (r + g + b) / 3
    yy, xx = np.mgrid[:h, :w]
    nx, ny, hx, hy = neck[0] - box[0], neck[1] - box[1], head[0] - box[0], head[1] - box[1]
    dn, dh = np.hypot(xx - nx, yy - ny), np.hypot(xx - hx, yy - hy)

    def ss(v, a0, a1):
        t = np.clip((v - a0) / (a1 - a0), 0, 1)
        return t * t * (3 - 2 * t)

    hairish = (r - g > 32) & (lum > 105)
    cape = (b >= r - 4) & (lum < 125) & (al > 128)
    if right:
        cape |= (xx > nx + right) & (yy > ny - 30) & (al > 128) & ~hairish
    hair = hairish & (al > 128) & (dh > headr * 0.8)

    def grow(m, n=25, blur=9):
        i = Image.fromarray((m * 255).astype("uint8")).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(5))
        core = np.asarray(i) > 128
        out = np.asarray(i.filter(ImageFilter.MaxFilter(n * 2 + 1))) > 128  # 布の外へも広げて、輪郭ごと動かす
        return np.asarray(Image.fromarray(((core | (out & (al < 40))) * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(blur))).astype(float) / 255

    c = grow(cape) * ss(dn, 50, reach) * ss(dh, headr * 1.15, headr * 1.35)
    hr = grow(hair) * ss(dh, headr, headr + reach * 0.8)
    m = np.dstack([c * 255, hr * 255, np.zeros_like(c)]).astype("uint8")
    return Image.fromarray(m).resize((256, round(256 * h / w)), Image.BILINEAR)


def save(im: Image.Image, path, width: int) -> None:
    cc.webp(im.resize((width, round(im.height * width / im.width)), Image.LANCZOS), path)


def faces(cid: str) -> None:
    """顔のところだけ差し替えた絵を作る。口パクは、その表情の絵をもとに口だけ開ける"""
    import char_image as ci
    src = cc.SRC / cid / "proto"
    base = src / "sit-wind-smile.png"
    tail = ". Everything else must stay identical. No text. Original anime-style character, 15 years old, not resembling any existing character."
    head = "Redraw the reference image EXACTLY, with the same pose, size, position, hair, outfit, cape, colors and the same plain green background, changing ONLY "

    def one(job: tuple[str, Path, str]) -> str:
        name, ref, words = job
        out = src / f"{name}-patched.png"
        if not out.exists():
            raw = src / f"{name}-raw.png"
            ci.generate([ci._img(ref), {"text": head + words + tail}], raw)
            cc.patch(base, raw, FACE_BOX, aligned=True).save(out)
        return name

    first = [(n, base, "her facial expression to " + t) for n, t in EXPRESSION.items()]
    with ThreadPoolExecutor(3) as ex:
        print(list(ex.map(one, first)), flush=True)
    talk = [(f"{f}-talk", base if f == "smile" else src / f"{f}-patched.png", "her mouth: " + TALKING) for f in TALK]
    with ThreadPoolExecutor(3) as ex:
        print(list(ex.map(one, talk)), flush=True)


def main(cid: str) -> None:
    src, dst = cc.SRC / cid / "proto", SPECIAL / cid
    conf = SETS[cid]
    w = conf["wind"]
    full = key(src / w["file"], False)
    box = crop_box(full, PAD)
    im = full.crop(box)
    save(im, dst / "wind-smile.webp", 780)
    weight(im, box, w["neck"], w["head"], w["headr"], w["reach"], w["right"]).save(dst / "wind-map.png")
    for f in FACES:
        o = key(src / f"{f}-patched.png", False).crop(box)
        o.putalpha(im.getchannel("A"))  # 顔のまわり以外は同じ絵。輪郭も同じにする
        save(o, dst / f"wind-{f}.webp", 780)
    print("wind", im.size, "体の中心", (w["neck"][0] - box[0]) / im.width, "縦横", 780, round(im.height * 780 / im.width), flush=True)
    k = conf["keypose"]
    full = key(src / k["file"], False)
    box = crop_box(full, 60)
    im = full.crop(box)
    save(im, dst / "keypose.webp", 900)
    weight(im, box, k["neck"], k["head"], k["headr"], k["reach"], k["right"]).save(dst / "keypose-map.png")
    print("keypose", 900, round(im.height * 900 / im.width), flush=True)
    save(key(src / "cutin-face.png", False), dst / "cutin.webp", 800)


if __name__ == "__main__":
    if sys.argv[1] == "faces":
        faces(sys.argv[2])
    else:
        main(sys.argv[1])
