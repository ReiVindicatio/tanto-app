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
SETS = {"hoshiyomi": {"wind": dict(neck=(264, 542), head=(280, 409), headr=155, reach=730, right=190, limit=(40, -75, 280), file="sit-wind-smile.png"),
                      "keypose": dict(neck=(350, 210), head=(347, 145), headr=62, reach=560, right=0, cloth=False, file="key-pose.png"),
                      "face_box": (100 / 1024, 290 / 1024, 470 / 1024, 545 / 1024), "width": 780, "clean": True,
                      "sprites": {"scale": 300}},
        "nocturne": {"wind": dict(neck=(512, 585), head=(512, 344), headr=215, reach=520, right=0, file="sit-wind-smile.png"),
                     "keypose": dict(neck=(516, 224), head=(516, 138), headr=70, reach=640, right=0, file="key-pose.png"),
                     "face_box": (300 / 1024, 240 / 1024, 730 / 1024, 545 / 1024), "width": 560,
                     "sprites": {"book-closed": 170, "book-closed2": 170, "book-open": 220, "page": 120}},
        "yukihana": {"wind": dict(neck=(500, 485), head=(515, 333), headr=197, reach=420, right=0, file="sit-wind-smile.png"),
                     "keypose": dict(neck=(508, 316), head=(498, 240), headr=86, reach=560, right=0, file="key-pose.png"),
                     "face_box": (390 / 1024, 300 / 1024, 715 / 1024, 515 / 1024), "width": 620, "cloth": False, "clean": True,
                     "ear": "h1-ear-patched.png", "ear_box": (0.3, 0.42, 0.72, 0.6), "ring": "r1-cut.png"},
        "rock": {"wind": dict(neck=(486, 435), head=(499, 282), headr=150, reach=420, right=0, hair_to=430, file="sit-wind-smile.png"),
                 "keypose": dict(neck=(504, 235), head=(481, 135), headr=85, reach=560, right=0, hair_to=235, file="key-pose.png"),
                 "face_box": (330 / 1024, 200 / 1024, 625 / 1024, 410 / 1024), "width": 620, "cloth": False, "clean": True},
        "diva": {"wind": dict(neck=(515, 480), head=(515, 318), headr=190, reach=420, right=0, file="sit-wind-smile.png"),
                 "keypose": dict(neck=(503, 245), head=(503, 187), headr=60, reach=560, right=0, file="key-pose.png"),
                 "face_box": (340 / 1024, 305 / 1024, 690 / 1024, 525 / 1024), "width": 620, "cloth": False, "clean": True},
        "hakama": {"wind": dict(neck=(490, 590), head=(490, 450), headr=170, reach=360, right=0, file="sit-wind-smile.png"),
                   "keypose": dict(neck=(520, 345), head=(527, 270), headr=90, reach=560, right=0, file="key-pose.png"),
                   "face_box": (340 / 1024, 360 / 1024, 640 / 1024, 590 / 1024), "width": 900, "cloth": False, "clean": True,
                   "birds": {"stand": ("bird", False, 0, True), "up": ("bird-up", True, 0, False), "down": ("bird-down", False, 0, False), "tilt": ("bird", False, -13, True), "happy": ("bird-happy", False, 0, True)}}}
# 口パクは、声が流れる表情（5つ）だけ
TALK = "normal smile think happy sad".split()
FACES = "normal think happy sad sleepy surprised smug jito blink".split() + [f"{f}-talk" for f in TALK]
EXPRESSION = {"normal": "a neutral relaxed expression with a small open mouth, as if about to speak", "think": "a thoughtful expression, eyes looking slightly upward, mouth small",
              "happy": "a very happy expression, eyes closed in joyful arcs, wide open smiling mouth", "sad": "a little sad expression, eyebrows lowered, small frown",
              "sleepy": "a very sleepy expression, eyes half closed, small mouth", "surprised": "a surprised expression, eyes wide open, small round open mouth",
              "smug": "a proud smug expression, eyes half closed, one corner of the mouth up",
              "jito": "a deadpan sulky stare: the upper eyelids lowered straight across, covering the top third of her eyes, with her brown irises and dark pupils still clearly visible and looking at the viewer, and a small straight mouth",
              "blink": "the same gentle smile but both eyes closed in a blink"}
TALKING = {"normal": "a clearly open mouth as if saying the sound 'ah', noticeably wider than in the reference", "smile": "a soft open mouth in the middle of speaking a word, with the tongue barely visible",
           "think": "a small open round mouth as if saying 'oh'", "happy": "a big wide open laughing mouth, noticeably wider than in the reference", "sad": "a small soft open mouth in the middle of speaking a word"}


def crop_box(im: Image.Image, pad: int) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = im.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
    return max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)


def weight(im: Image.Image, box: tuple, neck: tuple, head: tuple, headr: int, reach: int, right: int, cloth: bool = True, limit: tuple | None = None, hair_to: int | None = None) -> Image.Image:
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
    if limit:  # マントのある範囲だけ（紺のドレスや帽子もマントと同じ色なので、色だけでは分けられない）
        cape &= (xx > nx + limit[0]) & (yy > ny + limit[1]) & (yy < ny + limit[2])
    hair = hairish & (al > 128) & (dh > headr * 0.8)
    if hair_to is not None:  # 髪より下に赤い服があると、色だけでは髪と分けられない（ロッカーのタータン）
        hair &= yy < hair_to - box[1]

    def grow(m, n=25, blur=9):
        i = Image.fromarray((m * 255).astype("uint8")).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(5))
        core = np.asarray(i) > 128
        out = np.asarray(i.filter(ImageFilter.MaxFilter(n * 2 + 1))) > 128  # 布の外へも広げて、輪郭ごと動かす
        return np.asarray(Image.fromarray(((core | (out & (al < 40))) * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(blur))).astype(float) / 255

    c = (grow(cape) * ss(dn, 50, reach) * ss(dh, headr * 1.15, headr * 1.35)) if cloth else np.zeros((h, w))  # 雪花の服は動かさず、髪だけ
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
            cc.patch(base, raw, SETS[cid]["face_box"], aligned=True).save(out)
        return name

    first = [(n, base, "her facial expression to " + t) for n, t in EXPRESSION.items()]
    with ThreadPoolExecutor(3) as ex:
        print(list(ex.map(one, first)), flush=True)
    talk = [(f"{f}-talk", base if f == "smile" else src / f"{f}-patched.png", "her mouth to " + TALKING[f] + ". Keep both eyes and both eyebrows exactly as they are in the reference, fully drawn") for f in TALK]
    with ThreadPoolExecutor(3) as ex:
        print(list(ex.map(one, talk)), flush=True)


def main(cid: str) -> None:
    src, dst = cc.SRC / cid / "proto", SPECIAL / cid
    conf = SETS[cid]
    w = conf["wind"]
    full = key(src / w["file"], False)
    if conf.get("clean"):  # 背景の色むらが薄く残る絵は、それも抜く（そうしないと切り抜きが画面いっぱいになる）
        full.putalpha(full.getchannel("A").point(lambda v: 0 if v < 64 else v))
    box = crop_box(full, PAD)
    im = full.crop(box)
    width = conf["width"]
    save(im, dst / "wind-smile.webp", width)
    weight(im, box, w["neck"], w["head"], w["headr"], w["reach"], w["right"], conf.get("cloth", True), w.get("limit"), w.get("hair_to")).save(dst / "wind-map.png")
    for f in FACES:
        if not (src / f"{f}-patched.png").exists():
            print("まだない：", f, flush=True)
            continue
        o = key(src / f"{f}-patched.png", False).crop(box)
        o.putalpha(im.getchannel("A"))  # 顔のまわり以外は同じ絵。輪郭も同じにする
        save(o, dst / f"wind-{f}.webp", width)
    print("wind", im.size, "体の中心", (w["neck"][0] - box[0]) / im.width, "縦横", width, round(im.height * width / im.width), flush=True)
    sit_full, sit_box, sit_im = full, box, im  # 耳の絵は座り絵に重ねるので、決めの絵で上書きする前に覚えておく
    k = conf["keypose"]
    full = key(src / k["file"], False)
    if conf.get("clean"):
        full.putalpha(full.getchannel("A").point(lambda v: 0 if v < 64 else v))
    box = crop_box(full, 60)
    im = full.crop(box)
    save(im, dst / "keypose.webp", 900)
    weight(im, box, k["neck"], k["head"], k["headr"], k["reach"], k["right"], k.get("cloth", conf.get("cloth", True)), None, k.get("hair_to")).save(dst / "keypose-map.png")
    print("keypose", 900, round(im.height * 900 / im.width), flush=True)
    save(key(src / "cutin-face.png", False), dst / "cutin.webp", 800)
    if "ear" in conf:  # 耳を折った絵は、耳のまわりだけ重ねる。絵全体を重ねると律が二重に見えた（ユーザー）。表情を替えても使える
        ex0, ey0, ex1, ey1 = conf["ear_box"]
        e = key(src / conf["ear"], False).resize(sit_full.size).crop(sit_box)
        e.putalpha(Image.fromarray(np.maximum(np.asarray(e.getchannel("A")), np.asarray(sit_im.getchannel("A")))))
        d = np.abs(np.asarray(e.convert("RGB")).astype(int) - np.asarray(sit_im.convert("RGB")).astype(int)).sum(2) > 40
        area = np.zeros(d.shape, bool)
        area[round(ey0 * sit_im.height) : round(ey1 * sit_im.height), round(ex0 * sit_im.width) : round(ex1 * sit_im.width)] = True
        m = Image.fromarray(((d & area) * 255).astype("uint8")).filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(2))
        e.putalpha(m)
        save(e, dst / "ear.webp", width)
    for name, (file, flip, rot, ground) in conf.get("birds", {}).items():  # 小鳥：コマごとに同じ大きさの枠に置く（足元か中央にそろえる）
        r = key(src / f"{file}.png", False)
        r.putalpha(r.getchannel("A").point(lambda v: 0 if v < 90 else v))
        if flip:
            r = r.transpose(Image.FLIP_LEFT_RIGHT)
        c = r.crop(r.getchannel("A").getbbox())
        if rot:
            c = c.rotate(rot, expand=True, resample=Image.BICUBIC)
            c = c.crop(c.getchannel("A").getbbox())
        can = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
        can.alpha_composite(c, ((600 - c.width) // 2, 600 - c.height if ground else (600 - c.height) // 2))
        save(can, dst / f"bird-{name}.webp", 150)
    if "ring" in conf:  # 背中の輪は切り抜いた絵をそのまま
        ring = Image.open(src / conf["ring"]).convert("RGBA")
        save(ring, dst / "ring.webp", 560)
    for name, sw in conf.get("sprites", {}).items():
        sp = key(src / f"{name}.png", False)
        save(sp.crop(crop_box(sp, 6)), dst / f"{name}.webp", sw)


if __name__ == "__main__":
    if sys.argv[1] == "faces":
        faces(sys.argv[2])
    else:
        main(sys.argv[1])
