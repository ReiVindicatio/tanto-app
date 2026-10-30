"""律の絵（T063・T065）の背景を抜き、大きさをそろえて webp にする。

  python3 pipeline/char_cut.py <テーマ>      # audio/samples_char/themes/<テーマ>/ → app/public/chars/ritsu/<テーマ>/

- Pillow が要る（このリポジトリのほかのスクリプトは標準ライブラリだけ）。venv を作って入れる：
    python3 -m venv /tmp/charvenv && /tmp/charvenv/bin/pip install pillow && /tmp/charvenv/bin/python pipeline/char_cut.py knit
- webp への変換は cwebp（brew install webp）。ffmpeg は libwebp なしのことがある
- 背景は「端につながる、背景に近い色」だけを消す（塗りつぶし）。白いシャツなど内側の白は残る
- ふつうの絵は全部の表情を同じ範囲で切る（表情を変えても絵が動かない）。ちびキャラは1枚ずつ詰める。
  のぞく絵は縁（灰色の帯の上の線）より上だけを残し、下端を縁にする。腰かける絵は縁の線と帯を消し、ぶら下げた足を残す
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "audio" / "samples_char" / "themes"
DST = ROOT / "app" / "public" / "chars" / "ritsu"
FACES = "normal smile think happy sad sleepy surprised smug jito".split()
KEY = (255, 0, 255)


def cutout(im: Image.Image, seeds: list[tuple[int, int]]) -> Image.Image:
    """端からの塗りつぶしで背景を透明にする"""
    w, h = im.size
    mark = im.copy()
    for seed in seeds:
        if mark.getpixel(seed) != KEY:
            ImageDraw.floodfill(mark, seed, KEY, thresh=28)
    alpha = Image.new("L", (w, h), 255)
    px, ap = mark.load(), alpha.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == KEY:
                ap[x, y] = 0
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))  # 縁をなめらかに
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def edges(w: int, h: int) -> list[tuple[int, int]]:
    return [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]


def bbox(im: Image.Image) -> tuple[int, int, int, int]:
    return im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()


def webp(im: Image.Image, path: Path) -> None:
    with tempfile.NamedTemporaryFile(suffix=".png") as f:
        im.save(f.name)
        subprocess.run(["cwebp", "-quiet", "-q", "85", "-alpha_q", "90", f.name, "-o", str(path)], check=True)


def base_set(src: Path, dst: Path, width: int = 480) -> None:
    outs = {}
    for n in FACES:
        im = Image.open(src / f"base-{n}.png").convert("RGB")
        outs[n] = cutout(im, edges(*im.size))
    boxes = [bbox(o) for o in outs.values()]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    for n, o in outs.items():
        c = o.crop(box)
        webp(c.resize((width, round(c.height * width / c.width)), Image.LANCZOS), dst / f"base-{n}.webp")
    # 口パク（口を開けた絵）：口のまわりだけ貼って、同じ範囲で切る
    for n in FACES:
        t = src / f"talk-base-{n}.png"
        if t.exists():
            o = cutout(patch(src / f"base-{n}.png", t, MOUTH_BASE, aligned=True), edges(*outs[n].size)).crop(box)
            webp(o.resize((width, round(o.height * width / o.width)), Image.LANCZOS), dst / f"base-{n}-talk.webp")


def chibi(src: Path, dst: Path, width: int = 240) -> None:
    im = Image.open(src).convert("RGB")
    o = cutout(im, edges(*im.size))
    o = o.crop(bbox(o))
    webp(o.resize((width, round(o.height * width / o.width)), Image.LANCZOS), dst)


def peek(src: Path, dst: Path, width: int = 240) -> None:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    g = im.convert("L").load()
    # 縁の線：左右の端（キャラの外）が暗い最初の行。線のにじみを残さないよう少し上で切る
    ly = next(y for y in range(h // 3, h) if g[5, y] < 150 and g[w - 6, y] < 150) - 5
    im = im.crop((0, 0, w, ly))
    o = cutout(im, [(0, 0), (w - 1, 0), (w // 2, 0), (0, ly - 2), (w - 1, ly - 2)])
    x0, y0, x1, _ = o.getchannel("A").point(lambda v: 255 if v > 8 else 0).crop((0, 0, w, ly - 3)).getbbox()
    o = o.crop((x0, y0, x1, ly))  # 下端は縁のまま
    webp(o.resize((width, round(o.height * width / o.width)), Image.LANCZOS), dst)  # 幅（おさげの端から端）でそろえる


def ledge_cut(im: Image.Image) -> tuple[Image.Image, int, int]:
    """縁に腰かける・寝そべる絵の背景を抜く：縁の線と灰色の帯を消し、ぶら下げた足は残す。（全体の大きさの絵, 縁の線の上端, 下端）"""
    im = im.convert("RGB")
    w, h = im.size
    g = im.convert("L").load()
    dark = lambda y: g[5, y] < 150 and g[w - 6, y] < 150  # 左右の端（キャラの外）が暗い行＝縁の線
    top = next(y for y in range(h // 3, h) if dark(y))
    bot = top
    while bot + 1 < h and dark(bot + 1):
        bot += 1
    o = cutout(im.crop((0, 0, w, top)), [(0, 0), (w - 1, 0), (w // 2, 0), (0, top - 3), (w - 1, top - 3)])
    full = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    full.paste(o, (0, 0))
    # 縁の線から下：縁は横にどこまでも同じ色なので、行ごとに端の色と近いところを消す（足だけが残る）
    px, fp = im.load(), full.load()
    for y in range(max(0, top - 6), h):
        edge = [(px[2, y][i] + px[w - 3, y][i]) / 2 for i in range(3)]
        for x in range(w):
            c = px[x, y]
            # 帯は灰色（色みがない）。色みのあるところ（ミントのズボン・肌など）は、明るさが帯に近くても残す（2026-10-27 パジャマで足が欠けた）
            colorful = max(c) - min(c) > 14 and max(edge) - min(edge) < 10
            if sum(abs(c[i] - edge[i]) for i in range(3)) > 45 or colorful:
                fp[x, y] = (*c, 255)
            else:
                fp[x, y] = (0, 0, 0, 0)
    # 縁の線（帯の上の端・下の端など、左右の端まで暗い行）：その列の線のすぐ上とすぐ下がどちらも背景なら消す（手・足がまたぐ列は残す）
    al = full.getchannel("A").load()
    rows = [y for y in range(max(0, top - 2), h) if g[5, y] < 200 and g[w - 6, y] < 200]
    runs: list[list[int]] = []
    for y in rows:
        if runs and y - runs[-1][-1] <= 1:
            runs[-1].append(y)
        else:
            runs.append([y])
    for run in runs:
        y0, y1 = run[0], run[-1]
        up, down = max(0, y0 - 4), min(h - 1, y1 + 4)
        for x in range(w):
            if al[x, up] <= 40 and al[x, down] <= 40:
                for y in range(max(0, y0 - 3), min(h, y1 + 4)):
                    fp[x, y] = (0, 0, 0, 0)
    # 体につながっていない点（影など）を消す：縁の少し上の体から塗って、届かなかった下の点は消す
    mask = full.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    row = top - 10
    xs = [x for x in range(w) if mask.getpixel((x, row)) == 255]
    if xs:
        ImageDraw.floodfill(mask, (xs[len(xs) // 2], row), 128)
        mp = mask.load()
        for y in range(top - 6, h):
            for x in range(w):
                if mp[x, y] != 128:
                    fp[x, y] = (0, 0, 0, 0)
        # 縁より下で、体の横の範囲より外にあるもの（帯の消し残しが足につながったもの）も消す（2026-10-28 パーカー）
        above = mask.point(lambda v: 255 if v == 128 else 0).crop((0, 0, w, top - 4)).getbbox()
        if above:
            for y in range(top - 6, h):
                for x in list(range(0, max(0, above[0] - 12))) + list(range(min(w, above[2] + 12), w)):
                    fp[x, y] = (0, 0, 0, 0)
    return full, top, bot


def body_above(full: Image.Image, top: int) -> tuple[int, int, int, int] | None:
    """縁の線より上で、体につながった部分の範囲（離れたキラキラ・帯の消し残しは入れない）"""
    mask = full.getchannel("A").point(lambda v: 255 if v > 40 else 0).crop((0, 0, full.width, top - 4))
    xs = [x for x in range(full.width) if mask.getpixel((x, top - 10)) == 255]
    if not xs:
        return None
    ImageDraw.floodfill(mask, (xs[len(xs) // 2], top - 10), 128)
    return mask.point(lambda v: 255 if v == 128 else 0).getbbox()


# 腰かける絵の、画面での大きさ（幅 240 の絵の中で、縁の線から頭のてっぺんまでの高さ）。どの衣装・表情・仕草もこの大きさにそろえる
SIT_HEIGHT = 270
SIT_TOP_MARGIN = 16  # 頭の上のすき間（伸びをした手など）


def sit_ref(src: Path) -> tuple[float, float, dict[str, float]]:
    """その衣装の腰かける絵の縮め方（倍率）と、体の中心の x。全部の表情の絵のまんなかの値（一枚だけ大きく描かれた絵に引っぱられない）。
    3つめは表情ごとの倍率：まんなかより 5% を超えて大きく（小さく）描かれた表情だけ、その表情の倍率でそろえる（いつもの服の「ふつう」は 16% 大きく描かれていた）。
    2026-10-28：表情ごとに絵の範囲で切っていたので、キラキラや帯の消し残しで範囲が広がった表情だけ小さくなり、
    表情や仕草が変わるたびに大きさと位置が変わった（パーカーで 202〜375。ユーザー）"""
    hs: dict[str, int] = {}
    cs = []
    for n in FACES:
        p = src / f"sit-{n}.png"
        if n == "surprised" or not p.exists():
            continue
        full, top, _ = ledge_cut(Image.open(p))
        b = body_above(full, top)
        if b:
            hs[n] = top - b[1]
            cs.append((b[0] + b[2]) / 2)
    mid = sorted(hs.values())[len(hs) // 2]
    cs.sort()
    per = {n: SIT_HEIGHT / h for n, h in hs.items() if abs(h / mid - 1) > 0.05}
    return SIT_HEIGHT / mid, cs[len(cs) // 2], per


def align(b: Image.Image, f: Image.Image, box: tuple[float, float, float, float], reach: int = 24) -> Image.Image:
    """frame が絵全体ごと少しずれて描かれていることがある（口パクの絵で起きた）。box のまわりで、base といちばん重なる位置へずらす"""
    w, h = b.size
    x0, y0, x1, y1 = int(box[0] * w) - reach, int(box[1] * h) - reach, int(box[2] * w) + reach, int(box[3] * h) + reach
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    small = 4  # 縮めて粗く探してから
    bg = b.convert("L").crop((x0, y0, x1, y1)).resize(((x1 - x0) // small, (y1 - y0) // small))
    best, bd = (0, 0), None
    for dy in range(-reach, reach + 1, small):
        for dx in range(-reach, reach + 1, small):
            fg = f.convert("L").crop((x0 + dx, y0 + dy, x1 + dx, y1 + dy)).resize(bg.size)
            d = sum(ImageChops.difference(bg, fg).getdata())
            if bd is None or d < bd:
                best, bd = (dx, dy), d
    if best == (0, 0):
        return f
    out = Image.new("RGB", f.size, (255, 255, 255))
    out.paste(f, (-best[0], -best[1]))
    return out


def patch(base: Path, frame: Path, box: tuple[float, float, float, float], thresh: int = 60, aligned: bool = False) -> Image.Image:
    """動きのコマ（T065）：frame のうち、box（幅・高さに対する割合）の中で base と大きく違うところだけを base に貼る。
    体はまったく動かず、目や足先だけが描き直される（コマごとに描き直すと線や位置がずれてちらつくため）。
    aligned なら、先に frame のずれを打ち消す（絵全体ごとずれて描かれたとき）"""
    b = Image.open(base).convert("RGB")
    f = Image.open(frame).convert("RGB").resize(b.size)
    if aligned:
        f = align(b, f, box)
    w, h = b.size
    x0, y0, x1, y1 = int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)
    bp, fp = b.load(), f.load()
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            if sum(abs(bp[x, y][i] - fp[x, y][i]) for i in range(3)) > thresh:
                mp[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(2))  # 少し広げてなじませる
    out = b.copy()
    out.paste(f, (0, 0), mask)
    return out


def sit_group(srcs: list[Image.Image], dsts: list[Path], width: int = 240, below: float = 0.40, union: bool = False,
              ref: tuple[float, float] | None = None) -> None:
    """同じ姿勢のコマを、同じ範囲で切りそろえる（重ねて切り替えても動かない）。
    出力は、縁の線が下から width*below の高さにくるようにそろえる（画面では、その分だけ欄の縁より下にずらして置く）。
    below は 0.40（2026-10-27：0.25 だと、パジャマのズボンで足先が切れた。0.35 でも、パジャマの足をぶらぶらさせるコマで切れた）。
    ref（sit_ref の倍率と中心）を渡すと、絵の範囲ではなくその倍率・中心で切る（衣装の中のどの表情・仕草も同じ大きさと位置）"""
    cuts = [ledge_cut(im) for im in srcs]
    if ref:
        scale, cx = ref
        b = round(width * below)
        for (full, top, _), dst in zip(cuts, dsts):
            sw = width / scale  # 元の絵での幅
            x0 = cx - sw / 2
            y0 = top - (SIT_HEIGHT + SIT_TOP_MARGIN) / scale
            y1 = top + b / scale
            o = full.crop((round(x0), round(y0), round(x0 + sw), round(y1)))  # はみ出したところは透明
            webp(o.resize((width, SIT_HEIGHT + SIT_TOP_MARGIN + b), Image.LANCZOS), dst)
        return
    top, bot = cuts[0][1], cuts[0][2]
    # 範囲は1枚目（元の絵）で決める。コマの側がはみ出しても元の絵の大きさを変えない。union なら全部が収まる範囲（足先が外へ動くコマ）
    boxes = [bbox(c[0]) for c in (cuts if union else cuts[:1])]
    x0, y0, x1, y1 = min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)
    for (full, _, _), dst in zip(cuts, dsts):
        o = full.crop((x0, y0, x1, max(y1, bot + 1)))
        line = top - y0  # 切り抜いた絵の中での縁の線の高さ
        scale = width / o.width
        o = o.resize((width, round(o.height * scale)), Image.LANCZOS)
        line = round(line * scale)
        b = round(width * below)
        canvas = Image.new("RGBA", (width, line + b), (0, 0, 0, 0))
        canvas.paste(o.crop((0, 0, width, min(o.height, line + b))), (0, 0))
        webp(canvas, dst)


def sit(src: Path, dst: Path, width: int = 240, below: float = 0.40) -> None:
    sit_group([Image.open(src)], [dst], width, below)


BLINK_BOX = (0.25, 0.33, 0.75, 0.52)  # 腰かける絵の目のあたり（幅・高さに対する割合）
SWING_BOX = (0.25, 0.70, 0.75, 1.0)  # 腰かける絵のぶら下げた足のあたり（今は swing_box で絵ごとに決める）


def swing_box(sit_png: Path) -> tuple[float, float, float, float]:
    """足を振ったコマを貼る範囲：縁の線の少し上から下まで、横は体の幅に左右 15% ずつ足す。
    2026-10-28：決まった範囲（高さの 70% より下・幅のまんなか半分）だと、縁が高い絵（パジャマ）で膝から上が、
    前へ振った足先が範囲の外に出て貼られず、足が欠けて見えた（ユーザー）"""
    im = Image.open(sit_png)
    w, h = im.size
    full, top, _ = ledge_cut(im)
    b = body_above(full, top) or (int(0.25 * w), 0, int(0.75 * w), top)
    return (max(0.0, b[0] / w - 0.15), (top - 12) / h, min(1.0, b[2] / w + 0.15), 1.0)
MOUTH_SIT = (0.38, 0.43, 0.62, 0.60)  # 腰かける絵の口のあたり
MOUTH_BASE = (0.37, 0.28, 0.63, 0.44)  # 立ち絵の口のあたり
GESTURE_BOX = (0.0, 0.0, 1.0, 0.78)  # 仕草：座る線より上（足は元の絵のまま）
GESTURES = {"yawn": "smile", "stretch": "smile", "rub": "smile", "sip": "smile", "signature": "smile", "nod": "normal", "clap": "happy", "pout": "jito"}
KICK_BOX = (0.55, 0.15, 1.0, 0.8)  # 寝そべる絵の上げた足先のあたり


def backgrounds() -> None:
    """律のページの背景（audio/samples_char/bg/*.png → app/public/chars/bg/*.webp。幅 960）"""
    out = DST.parent / "bg"
    out.mkdir(parents=True, exist_ok=True)
    for f in sorted((SRC.parent / "bg").glob("*.png")):
        r = Image.open(f).convert("RGB")
        r = r.resize((960, round(r.height * 960 / r.width)), Image.LANCZOS)
        with tempfile.NamedTemporaryFile(suffix=".png") as t:
            r.save(t.name)
            subprocess.run(["cwebp", "-quiet", "-q", "78", t.name, "-o", str(out / f"{f.stem}.webp")], check=True)
    print(f"✅ {out.relative_to(ROOT)}")


def main() -> None:
    name = sys.argv[1]
    if name == "bg":
        backgrounds()
        return
    src, dst = SRC / name, DST / name
    dst.mkdir(parents=True, exist_ok=True)
    only_motion = "--sit" in sys.argv  # 腰かける・寝そべる・動きの絵だけ（ふつうの絵・ちびキャラは作り直さない）
    if not only_motion:
        base_set(src, dst)
    ref = sit_ref(src) if (src / "sit-smile.png").exists() else None
    for n in FACES:
        if not only_motion:
            chibi(src / f"chibi-{n}.png", dst / f"chibi-{n}.webp")
            if n != "surprised" and (src / f"peek-{n}.png").exists():
                peek(src / f"peek-{n}.png", dst / f"peek-{n}.webp")
        s = src / f"sit-{n}.png"
        if n == "surprised" or not s.exists():
            continue
        frames, dsts = [Image.open(s)], [dst / f"sit-{n}.webp"]
        if (src / f"blink-{n}.png").exists():
            frames.append(patch(s, src / f"blink-{n}.png", BLINK_BOX))
            dsts.append(dst / f"sit-{n}-blink.webp")
        for k in (1, 2):  # 足のバタバタ（足を振ったコマ）
            if (src / f"swing-{n}-{k}.png").exists():
                frames.append(patch(s, src / f"swing-{n}-{k}.png", swing_box(s)))
                dsts.append(dst / f"sit-{n}-swing-{k}.webp")
        if (src / f"talk-sit-{n}.png").exists():  # 口パク
            frames.append(patch(s, src / f"talk-sit-{n}.png", MOUTH_SIT, aligned=True))
            dsts.append(dst / f"sit-{n}-talk.webp")
        for g, from_face in GESTURES.items():  # 仕草（その表情の絵から作ったもの）
            if from_face == n and (src / f"gesture-{g}.png").exists():
                frames.append(patch(s, src / f"gesture-{g}.png", GESTURE_BOX, thresh=40))
                dsts.append(dst / f"gesture-{g}.webp")
        if (src / f"hop-{n}.png").exists():
            frames.append(Image.open(src / f"hop-{n}.png"))
            dsts.append(dst / f"hop-{n}.webp")
        sit_group(frames, dsts, ref=(ref[2].get(n, ref[0]), ref[1]) if ref else None)
    if (src / "mid-lie.png").exists():  # 座る→寝そべるの間（選んだ1枚を mid-lie.png にする）
        sit(src / "mid-lie.png", dst / "mid-lie.webp")
    lie = src / "lie-sleepy.png"
    if lie.exists():
        frames, dsts = [Image.open(lie)], [dst / "lie-sleepy.webp"]
        for k in (1, 2):
            if (src / f"lie-kick-{k}.png").exists():
                frames.append(patch(lie, src / f"lie-kick-{k}.png", KICK_BOX))
                dsts.append(dst / f"lie-kick-{k}.webp")
        sit_group(frames, dsts, width=320, below=0.08, union=True)
    if (src / "reveal.png").exists():  # お披露目の一枚絵（背景ごと。幅 960）
        r = Image.open(src / "reveal.png").convert("RGB")
        r = r.resize((960, round(r.height * 960 / r.width)), Image.LANCZOS)
        with tempfile.NamedTemporaryFile(suffix=".png") as f:
            r.save(f.name)
            subprocess.run(["cwebp", "-quiet", "-q", "82", f.name, "-o", str(dst / "reveal.webp")], check=True)
    print(f"✅ {dst.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
