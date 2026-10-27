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

from PIL import Image, ImageDraw, ImageFilter

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


def sit(src: Path, dst: Path, width: int = 240, below: float = 0.25) -> None:
    """縁に腰かける・寝そべる絵：縁の線と灰色の帯を消し、ぶら下げた足は残す。
    出力は、縁の線が下から width*below の高さにくるようにそろえる（画面では、その分だけ欄の縁より下にずらして置く）"""
    im = Image.open(src).convert("RGB")
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
            if sum(abs(c[i] - edge[i]) for i in range(3)) > 45:
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
    o = full
    x0, y0, x1, y1 = bbox(o)
    o = o.crop((x0, y0, x1, max(y1, bot + 1)))
    line = top - y0  # 切り抜いた絵の中での縁の線の高さ
    scale = width / o.width
    o = o.resize((width, round(o.height * scale)), Image.LANCZOS)
    line = round(line * scale)
    b = round(width * below)
    canvas = Image.new("RGBA", (width, line + b), (0, 0, 0, 0))
    canvas.paste(o.crop((0, 0, width, min(o.height, line + b))), (0, 0))
    webp(canvas, dst)


def main() -> None:
    name = sys.argv[1]
    src, dst = SRC / name, DST / name
    dst.mkdir(parents=True, exist_ok=True)
    base_set(src, dst)
    for n in FACES:
        chibi(src / f"chibi-{n}.png", dst / f"chibi-{n}.webp")
        if n != "surprised":
            if (src / f"peek-{n}.png").exists():
                peek(src / f"peek-{n}.png", dst / f"peek-{n}.webp")
            if (src / f"sit-{n}.png").exists():
                sit(src / f"sit-{n}.png", dst / f"sit-{n}.webp")
    if (src / "lie-sleepy.png").exists():
        sit(src / "lie-sleepy.png", dst / "lie-sleepy.webp", width=320, below=0.08)
    print(f"✅ {dst.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
