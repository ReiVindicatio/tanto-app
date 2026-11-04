"""律の特別な衣装の固有モーション（2026-11-03）：座り絵を最初と最後のコマにして、動画モデル（Veo）で数秒動かす。

  CHAR_PY の python で：python pipeline/ritsu_motion.py ID   # ritsu_motions.json の動きを作り、special/<ID>/motion-<名前>.mp4 へ
  そのあと python3 pipeline/ritsu_special_finish.py upload <ID>

- 緑の背景の動画から色を抜く。透明は mp4 に持てないので、左に色・右に透明度を並べて1本にする（再生は app/src/ritsu/MotionClip.tsx）
- 最初と最後は同じ絵なので、ふだんの座り絵とつながる。動き終わったあとの静止と、最後のずれたコマは切り落とす
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

import char_cut as cc
from common import ROOT
from ritsu_sit_plate import key
from ritsu_wind import PAD, SETS, SPECIAL, crop_box

VIDEO = ROOT / "audio" / "samples_char" / "video" / "motions"
MOTIONS = ROOT / "pipeline" / "ritsu_motions.json"
W, H = 720, 1280  # Veo の 9:16
FIG = 420  # 律の幅。動きや光が見切れないよう、まわりに余白をとる（ユーザー）
FIGS = {"hakama": 560, "hoshiyomi": 600, "nocturne": 270}  # 枝やマントで横に広い絵。司書はまわりの本も入る
SCALE = (0.55, 0.151, 0.62)  # 星詠みの天秤：体の範囲に対する左・上・高さ
# 司書のまわりの本（app/src/ritsu/BookAttendants.tsx の BOOKS と同じ）。律の絵の幅に対する位置。動画の最初と最後は、この並びで止まっている
BOOKS = [(-70, 80, "book-closed", 27, False), (-80, 48, "book-open", 36, True), (-62, 22, "book-closed2", 26, False),
         (70, 76, "book-closed", 24, True), (78, 45, "book-closed2", 30, False), (61, 19, "book-open", 29, True)]
BOTTOM = 160
OUT_W, OUT_H, FPS = 480, 854, 20
STILL = 6.0  # 最初のコマとの差がこれより小さければ、動き終わったとみなす
GOOD = 0.985  # 元の絵との形の重なり
STYLE = ("Keep the exact anime illustration style, flat clean line art and colors of the input image; her face, hair, outfit and proportions stay exactly the same throughout. "
         "Fixed camera, no zoom, no camera movement. The background stays a perfectly flat pure bright green with nothing on it. She stays in the same place at the same size. "
         "Everything stays inside the frame and never touches its edges: big effects go above her or to her left. Exactly two arms. No text, no letters, no extra people. Her modest clothing stays exactly the same. ")


def first_frame(cid: str, out: Path) -> list[float]:
    """動画の最初と最後のコマを作る。返り値は、ふだんの絵の幅に対する動画の位置 [左, 上, 幅]"""
    w = SETS[cid]["wind"]
    full = key(cc.SRC / cid / "proto" / w["file"], False)
    full.putalpha(full.getchannel("A").point(lambda v: 0 if v < 64 else v))
    box = crop_box(full, PAD)
    body = full.crop(full.getchannel("A").getbbox())
    size = FIGS.get(cid, FIG)
    k = size / body.width
    fig = body.resize((size, round(body.height * k)), Image.LANCZOS)
    bg = Image.new("RGB", (W, H), (0, 255, 0))
    x, y = (W - size) // 2, H - fig.height - BOTTOM
    fw = (box[2] - box[0]) * k
    if cid == "nocturne":
        fh = (box[3] - box[1]) * k
        pw = fw / 0.92  # .cape-figure.fig-books の幅
        ph = pw * 382 / 240
        left = x - PAD * k + fw + 0.04 * pw - pw
        bottom = y - PAD * k + fh + 0.22 * ph
        layers = {False: [], True: []}
        for i, (bx, by, name, bw, front) in enumerate(BOOKS):
            sp = Image.open(SPECIAL / cid / f"{name}.webp").convert("RGBA")
            sp = sp.resize((round(pw * bw / 100), round(sp.height * pw * bw / 100 / sp.width)), Image.LANCZOS).rotate(-(6 if i % 2 else -6), expand=True, resample=Image.BICUBIC)
            layers[front].append((sp, round(left + pw * (0.5 + bx / 100) - sp.width / 2), round(bottom - ph * (0.25 + by / 100) - sp.height / 2)))
        for sp, a, b in layers[False]:
            bg.paste(sp, (a, b), sp)
        bg.paste(fig, (x, y), fig)
        for sp, a, b in layers[True]:
            bg.paste(sp, (a, b), sp)
    elif cid == "hoshiyomi":  # 横に浮かぶ金の天秤（app/src/ritsu/kits.ts の live.scale と同じ置き場所）
        bg.paste(fig, (x, y), fig)
        sp = Image.open(SPECIAL / cid / "scale.webp").convert("RGBA")
        h = round(fig.height * SCALE[2])
        sp = sp.resize((round(sp.width * h / sp.height), h), Image.LANCZOS)
        bg.paste(sp, (x + round(size * SCALE[0]), y + round(fig.height * SCALE[1])), sp)
    else:
        bg.paste(fig, (x, y), fig)
    bg.save(out)
    # 位置は、配信している絵（wind-smile.webp）の体の範囲に合わせて求める。切り抜きの余白の計算がずれると、動画との継ぎ目がずれる
    shown = Image.open(SPECIAL / cid / "wind-smile.webp").convert("RGBA")
    sx0, sy0, sx1, _ = shown.getchannel("A").point(lambda v: 255 if v > 64 else 0).getbbox()
    per = (sx1 - sx0) / size  # 動画の1ピクセルが、配信の絵の何ピクセルか
    return [round((sx0 - x * per) / shown.width, 4), round((sy0 - y * per) / shown.width, 4), round(W * per / shown.width, 4)]


# 動画の端で光や破片がぷつっと切れないよう、上と左右の端で薄くして消す
_ramp = lambda n: np.clip(np.minimum(np.arange(n), np.arange(n)[::-1]) / 36, 0, 1)
EDGE = np.outer(np.clip(np.arange(OUT_H) / 36, 0, 1), _ramp(OUT_W))


def frames_of(src: Path, old_fig: int | None = None) -> list[np.ndarray]:
    """色を抜いて、透明度をかけた色（premultiplied）にする。縁の緑は全体で抑える（衣装に緑はない）。
    old_fig：前の置き方（律の幅）で作った動画を、今の置き方に縮めて直す"""
    with tempfile.TemporaryDirectory() as t:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", f"fps={FPS}", f"{t}/%03d.png"], check=True)
        out = []
        for f in sorted(Path(t).glob("*.png")):
            im = key(f, False)
            if old_fig:
                k = FIG / old_fig
                small = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
                can = Image.new("RGBA", im.size, (0, 0, 0, 0))
                # 足元の高さと左右の中央をそろえる
                can.paste(small, ((W - small.width) // 2, round((H - BOTTOM) * (1 - k))))
                im = can
            im = im.resize((OUT_W, OUT_H), Image.LANCZOS)
            a = np.asarray(im).astype(float)
            a[..., 3] = np.where(a[..., 3] < 64, 0, a[..., 3]) * EDGE
            a[..., 1] = np.minimum(a[..., 1], np.maximum(a[..., 0], a[..., 2]) + 6)
            out.append(a)
    return out


def overlap(a: np.ndarray, b: np.ndarray) -> float:
    x, y = a[..., 3] > 128, b[..., 3] > 128
    return float((x & y).sum() / max(1, (x | y).sum()))


def encode(frames: list[np.ndarray], out: Path) -> list[np.ndarray]:
    """動画の最後の数コマは、絵が大きくずれることがある（最後のコマの指定に飛びつく）。最初のコマと重なるところまで戻して、そこで終える"""
    first = frames[0]
    n = len(frames)
    while n > 2 and overlap(frames[n - 1], first) < GOOD:
        n -= 1
    end = n - 1
    while end > 1 and np.abs(frames[end] - first).mean() < STILL:
        end -= 1
    while end < n - 1 and overlap(frames[end], first) < GOOD:  # 戻りきるまで待つ
        end += 1
    keep = frames[: min(n, end + FPS // 4)]
    if overlap(keep[-1], first) < GOOD:
        print(f"  ⚠ {out.name}：最後が元の絵に重ならない（{overlap(keep[-1], first):.3f}）", flush=True)
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OUT_W * 2}x{OUT_H}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-crf", "24", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)], stdin=subprocess.PIPE)
    for a in keep:
        al = a[..., 3:] / 255
        pair = np.concatenate([a[..., :3] * al, np.repeat(a[..., 3:], 3, axis=2)], axis=1)
        p.stdin.write(pair.astype("uint8").tobytes())
    p.stdin.close()
    p.wait()
    print(f"  {out.name} {out.stat().st_size // 1024}KB {len(keep) / FPS:.1f}秒 重なり {overlap(keep[-1], first):.3f}", flush=True)
    return keep


def make(cid: str) -> None:
    import ritsu_video as rv

    g = VIDEO / cid
    g.mkdir(parents=True, exist_ok=True)
    first = g / "first.png"
    print("位置", first_frame(cid, first), flush=True)
    for m in json.loads(MOTIONS.read_text(encoding="utf-8"))[cid]:
        src = g / f"{m['name']}.mp4"
        if not src.exists():
            # 動画は作るたびに違う。元の動画がない環境でも、配信中の動きを別の出来で上書きしない（作り直すなら motion-<名前>.mp4 を消す）
            if (SPECIAL / cid / f"motion-{m['name']}.mp4").exists():
                continue
            rv.generate(STYLE + m["text"], first, src, m.get("seconds", 6), "9:16", last=first)
        encode(frames_of(src, m.get("old_fig")), SPECIAL / cid / f"motion-{m['name']}.mp4")


if __name__ == "__main__":
    make(sys.argv[1])
